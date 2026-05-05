$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8

$originalLocation = Get-Location
Set-Location (Join-Path $PSScriptRoot '..')

function ConvertTo-PlainData {
    param(
        [Parameter(Mandatory)]
        $InputObject
    )

    if ($InputObject -is [System.Collections.IDictionary]) {
        $result = [ordered]@{}
        foreach ($key in $InputObject.Keys) {
            $result[$key] = ConvertTo-PlainData -InputObject $InputObject[$key]
        }
        return $result
    }

    if ($InputObject -is [System.Collections.IEnumerable] -and -not ($InputObject -is [string])) {
        $items = @()
        foreach ($item in $InputObject) {
            $items += ,(ConvertTo-PlainData -InputObject $item)
        }
        return $items
    }

    if ($InputObject -is [pscustomobject]) {
        $result = [ordered]@{}
        foreach ($property in $InputObject.PSObject.Properties) {
            $result[$property.Name] = ConvertTo-PlainData -InputObject $property.Value
        }
        return $result
    }

    return $InputObject
}

function Read-JsonFile {
    param(
        [Parameter(Mandatory)]
        [string]$Path
    )

    if (-not (Test-Path $Path -PathType Leaf)) {
        throw "Required JSON file not found: $Path"
    }

    return ConvertTo-PlainData -InputObject (Get-Content $Path -Raw -Encoding UTF8 | ConvertFrom-Json)
}

function Write-Utf8File {
    param(
        [Parameter(Mandatory)]
        [string]$Path,
        [Parameter(Mandatory)]
        [string]$Content
    )

    $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
    [System.IO.File]::WriteAllText($Path, $Content + [Environment]::NewLine, $utf8NoBom)
}

function Normalize-RelativePath {
    param(
        [Parameter(Mandatory)]
        [string]$Path
    )

    $trimmed = $Path -replace '^[.][\\/]', ''
    if ([string]::IsNullOrWhiteSpace($trimmed)) {
        throw "Relative path cannot be empty: $Path"
    }

    return $trimmed -replace '/', '\'
}

try {
    $repoRoot = (Get-Location).Path
    $claudeMarketplacePath = Join-Path $repoRoot '.claude-plugin\marketplace.json'
    $agentsMarketplacePath = Join-Path $repoRoot '.agents\plugins\marketplace.json'
    $codexPluginsRoot = Join-Path $repoRoot 'codex-plugins'

    Write-Host '=== Sync Codex Plugins ===' -ForegroundColor Cyan

    $claudeMarketplace = Read-JsonFile -Path $claudeMarketplacePath
    $agentsMarketplace = Read-JsonFile -Path $agentsMarketplacePath

    if (-not $claudeMarketplace.Contains('metadata') -or -not $claudeMarketplace['metadata'].Contains('version')) {
        throw '.claude-plugin\marketplace.json metadata.version is required.'
    }

    $marketplaceVersion = [string]$claudeMarketplace['metadata']['version']
    if ([string]::IsNullOrWhiteSpace($marketplaceVersion)) {
        throw '.claude-plugin\marketplace.json metadata.version cannot be empty.'
    }

    $existingAgentsPlugins = @{}
    foreach ($plugin in @($agentsMarketplace['plugins'])) {
        $existingAgentsPlugins[$plugin['name']] = $plugin
    }

    $syncPlans = @()
    $syncedPlugins = @()
    $totalSkills = 0
    $seenPluginNames = @{}

    foreach ($plugin in @($claudeMarketplace['plugins'])) {
        $pluginName = [string]$plugin['name']
        if ([string]::IsNullOrWhiteSpace($pluginName)) {
            throw 'Plugin name in .claude-plugin\marketplace.json cannot be empty.'
        }

        if ($seenPluginNames.ContainsKey($pluginName)) {
            throw "Duplicate plugin name found in .claude-plugin\marketplace.json: $pluginName"
        }
        $seenPluginNames[$pluginName] = $true

        $pluginSourceRoot = Join-Path $repoRoot (Normalize-RelativePath -Path ([string]$plugin['source']))
        if (-not (Test-Path $pluginSourceRoot -PathType Container)) {
            throw "Plugin source directory not found for ${pluginName}: $pluginSourceRoot"
        }

        $codexPluginRoot = Join-Path $codexPluginsRoot $pluginName
        if (-not (Test-Path $codexPluginRoot -PathType Container)) {
            throw "Codex plugin root not found for ${pluginName}: $codexPluginRoot"
        }

        $codexPluginManifestPath = Join-Path $codexPluginRoot '.codex-plugin\plugin.json'
        $codexPluginManifest = Read-JsonFile -Path $codexPluginManifestPath
        $codexPluginManifest['version'] = $marketplaceVersion

        $seenSkillNames = @{}
        $skillPlans = @()
        foreach ($skillPath in @($plugin['skills'])) {
            $normalizedSkillPath = Normalize-RelativePath -Path ([string]$skillPath)
            $skillName = Split-Path $normalizedSkillPath -Leaf
            if ($seenSkillNames.ContainsKey($skillName)) {
                throw "Duplicate skill '$skillName' found in plugin '$pluginName'."
            }
            $seenSkillNames[$skillName] = $true

            $sourceSkillPath = Join-Path $pluginSourceRoot $normalizedSkillPath
            if (-not (Test-Path $sourceSkillPath -PathType Container)) {
                throw "Skill source not found for plugin '$pluginName': $sourceSkillPath"
            }

            $skillPlans += [ordered]@{
                name = $skillName
                source = $sourceSkillPath
            }
        }

        $existingAgentsPlugin = $null
        if ($existingAgentsPlugins.ContainsKey($pluginName)) {
            $existingAgentsPlugin = $existingAgentsPlugins[$pluginName]
        }

        $category = $null
        if ($null -ne $existingAgentsPlugin -and $existingAgentsPlugin.Contains('category')) {
            $category = [string]$existingAgentsPlugin['category']
        } elseif ($codexPluginManifest.Contains('interface') -and $codexPluginManifest['interface'].Contains('category')) {
            $category = [string]$codexPluginManifest['interface']['category']
        } else {
            $category = 'Productivity'
        }

        $policyInstallation = 'AVAILABLE'
        $policyAuthentication = 'ON_INSTALL'
        if ($null -ne $existingAgentsPlugin -and $existingAgentsPlugin.Contains('policy')) {
            $existingPolicy = $existingAgentsPlugin['policy']
            if ($existingPolicy.Contains('installation')) {
                $policyInstallation = [string]$existingPolicy['installation']
            }
            if ($existingPolicy.Contains('authentication')) {
                $policyAuthentication = [string]$existingPolicy['authentication']
            }
        }

        $syncedPlugins += [ordered]@{
            name = $pluginName
            source = [ordered]@{
                source = 'local'
                path = "./codex-plugins/$pluginName"
            }
            policy = [ordered]@{
                installation = $policyInstallation
                authentication = $policyAuthentication
            }
            category = $category
        }

        $syncPlans += [ordered]@{
            name = $pluginName
            codexPluginRoot = $codexPluginRoot
            codexPluginManifestPath = $codexPluginManifestPath
            codexPluginManifest = $codexPluginManifest
            targetSkillsRoot = (Join-Path $codexPluginRoot 'skills')
            tempSkillsRoot = (Join-Path $codexPluginRoot 'skills.__sync_tmp')
            skills = $skillPlans
        }
    }

    foreach ($plan in $syncPlans) {
        Write-Host "--- Syncing $($plan['name']) ---" -ForegroundColor Blue

        $codexPluginManifestPath = [string]$plan['codexPluginManifestPath']
        $targetSkillsRoot = [string]$plan['targetSkillsRoot']
        $tempSkillsRoot = [string]$plan['tempSkillsRoot']
        if (Test-Path $tempSkillsRoot) {
            Remove-Item $tempSkillsRoot -Recurse -Force
        }

        New-Item -ItemType Directory -Path $tempSkillsRoot -Force | Out-Null

        try {
            foreach ($skillPlan in @($plan['skills'])) {
                $skillName = [string]$skillPlan['name']
                $sourceSkillPath = [string]$skillPlan['source']
                $destinationSkillPath = Join-Path $tempSkillsRoot $skillName
                Copy-Item $sourceSkillPath -Destination $destinationSkillPath -Recurse -Force
                $zhTwFiles = @(Get-ChildItem $destinationSkillPath -Recurse -File -Filter '*_zhTW.md')
                foreach ($zhTwFile in $zhTwFiles) {
                    Remove-Item $zhTwFile.FullName -Force
                }
                $totalSkills++
                Write-Host "  [OK] Copied $skillName" -ForegroundColor Green
            }

            if (Test-Path $targetSkillsRoot) {
                Remove-Item $targetSkillsRoot -Recurse -Force
                Write-Host "  [!] Cleared $targetSkillsRoot" -ForegroundColor Yellow
            }

            Move-Item -Path $tempSkillsRoot -Destination $targetSkillsRoot
            $codexPluginManifestJson = $plan['codexPluginManifest'] | ConvertTo-Json -Depth 100
            Write-Utf8File -Path $codexPluginManifestPath -Content $codexPluginManifestJson
            Write-Host "  [OK] Updated manifest version to $marketplaceVersion" -ForegroundColor Green
            Write-Host "  [OK] Synced $(@($plan['skills']).Count) skill(s) for $($plan['name'])" -ForegroundColor Green
        } finally {
            if (Test-Path $tempSkillsRoot) {
                Remove-Item $tempSkillsRoot -Recurse -Force
            }
        }
    }

    $updatedAgentsMarketplace = [ordered]@{}
    foreach ($entry in $agentsMarketplace.GetEnumerator()) {
        if ($entry.Key -ne 'plugins') {
            $updatedAgentsMarketplace[$entry.Key] = $entry.Value
        }
    }
    $updatedAgentsMarketplace['plugins'] = $syncedPlugins

    $agentsJson = $updatedAgentsMarketplace | ConvertTo-Json -Depth 100
    Write-Utf8File -Path $agentsMarketplacePath -Content $agentsJson
    Write-Host "  [OK] Rewrote $agentsMarketplacePath" -ForegroundColor Green

    Write-Host '--- Summary ---' -ForegroundColor Blue
    Write-Host "Plugins synced: $($syncedPlugins.Count)" -ForegroundColor Green
    Write-Host "Skills copied:  $totalSkills" -ForegroundColor Green
} finally {
    Set-Location $originalLocation
}
