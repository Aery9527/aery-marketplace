---
name: image-to-html
description: >-
  Use when converting a single visual mockup (PNG, JPG, screenshot, poster,
  banner, landing page) into high-fidelity HTML/CSS, when pixel-perfect
  alignment is needed, when cropping source image assets, or when debugging
  "why does the HTML look different from the original". Triggers on: "convert
  image to html", "implement from mockup", "crop assets from source image",
  "pixel perfect alignment", "where does it differ from the original",
  "fix it to match the original". Uses built-in Python tools for dimension
  inspection, precise cropping, and visual diff.
---

# Image to HTML

## Quick Navigation

- [Use Cases](#use-cases)
- [Working Principles](#working-principles)
- [Workflow](#workflow)
- [Python Tools](#python-tools)
- [Common Distortions & Debugging](#common-distortions--debugging)
- [Output Format](#output-format)
- [References](#references)
- [Example Prompts](#example-prompts)

## Use Cases

This skill handles **reconstructing a visual mockup as HTML/CSS**, including:

- Posters, promotional images, course pages, event banners, social cards, landing page heroes, product screenshots
- Rendering **on-screen text as real selectable HTML text**
- Rewriting **simple geometry, color blocks, borders, and shadows** as CSS
- Cropping **complex illustrations, photos, covers, and decorations** from the source image and embedding them
- Existing HTML that the user says "looks off", "doesn't match the original", or "something is misaligned"

If the core task is OCR, full-page PDF text extraction, or pure image compression, this skill is not the primary choice.

[Back to top](#quick-navigation)

## Working Principles

1. **Reconstruct structure first, then chase pixels.** Get blocks, hierarchy, text, colors, and major dimensions right before converging with diff.
2. **Keep text as text.** Unless the user explicitly allows a full-page screenshot embed, headings, paragraphs, lists, and button labels must be written as HTML text.
3. **Use CSS before cropping.** Solid color blocks, borders, rounded corners, shadows, arrows, and simple icons should be CSS-first.
4. **Crop only when truly complex, and only the minimum necessary asset.** Do not use a whole column, hero, or panel as an asset — avoid embedding a poster-inside-a-poster.
5. **Default to a precise static version.** Unless the user asks for responsive, lock down widths, heights, spacing, font sizes, and crops before considering fluid refactoring.
6. **Compare only same-size screenshots.** Visual diff must use a screenshot that matches the source image dimensions; comparing against a `fullPage` tall image is meaningless.
7. **Find the root cause before adjusting.** Double color bars, weird crop boundaries, or wrong proportions have a specific cause — do not blindly adjust offsets.

[Back to top](#quick-navigation)

## Workflow

1. **Clarify scope and output**
   - Obtain the source image path and target HTML path
   - Confirm static vs. responsive
   - Confirm which elements must be HTML text and which may use cropped source assets
2. **Measure the source image**
   - Use [scripts/image_info.py](scripts/image_info.py) to read width, height, and mode
   - Unless otherwise requested, use source image dimensions as the initial HTML baseline
3. **Decompose the layout**
   - Separate text elements, CSS-able elements, and complex assets that require cropping
   - If an asset is a small piece inside a panel, crop only that piece — not the whole panel
4. **Implement HTML/CSS**
   - Build the outer grid / flex structure first
   - Then add headlines, feature lists, spacing, colors, and shadows
5. **Crop source assets when necessary**
   - Use [scripts/crop_image.py](scripts/crop_image.py)
   - Each crop result should be a standalone asset, not a full design image shifted via `background-position`
6. **Preview at the same dimensions**
   - Set viewport to exactly match the source image before previewing
   - Do not use `fullPage` when taking the screenshot
7. **Run visual diff**
   - Use [scripts/visual_diff.py](scripts/visual_diff.py) to compare source image vs. render
   - Check size match first, then `mean_diff_ratio`, `changed_pixels`, and `diff_bbox`
8. **Fix the root cause from diff results**
   - If `diff_bbox` concentrates at the top, check whether a bar / heading has been duplicated
   - If differences are isolated to one asset, re-examine the crop box and `object-fit` / `background-size`
   - If the whole layout is off, revisit overall width/height, padding, gap, and font sizes — do not blindly tune local offsets
9. **Wrap up**
   - Deliver the HTML and any required assets
   - If a diff was run, keep the diff / overlay images for future regression

[Back to top](#quick-navigation)

## Python Tools

### Dependencies

- Python 3
- Pillow

If you see `ModuleNotFoundError: No module named 'PIL'`, install it first:

```bash
pip install Pillow
```

### Tool List

1. [scripts/image_info.py](scripts/image_info.py)
   - Reads image dimensions and mode
   - Example:
     ```bash
     python scripts/image_info.py --image poster.png --json
     ```
2. [scripts/crop_image.py](scripts/crop_image.py)
   - Precisely crops an asset by `xyxy` or `xywh` coordinates
   - Example:
     ```bash
     python scripts/crop_image.py --source poster.png --output cover-orange.png --box 31,34,436,351 --json
     ```
3. [scripts/visual_diff.py](scripts/visual_diff.py)
   - Compares source image vs. render; outputs `mean_diff_ratio`, `changed_pixels`, `diff_bbox`
   - Optionally outputs a raw diff image and an overlay image
   - Example:
     ```bash
     python scripts/visual_diff.py --expected poster.png --actual render.png --diff-out diff.png --overlay-out overlay.png --json
     ```

[Back to top](#quick-navigation)

## Common Distortions & Debugging

1. **Double color bar / double heading**
   - Usually not a CSS color error — caused by embedding a screenshot that already contains the header back into the HTML header area.
   - Fix: crop only the actual cover or illustration asset; keep bar/headline as HTML.
2. **Three-column crop has weird boundaries**
   - Do not assume assets divide the image evenly; most designs have inset margins and column padding.
   - Fix: measure the actual box, then crop the minimum required area.
3. **Page height is off**
   - Most commonly caused by comparing a `fullPage` screenshot against the source image.
   - Fix: set viewport height to match the source image; screenshot viewport only.
4. **Overall looks close but still "feels wrong"**
   - Check font size, `line-height`, `padding`, `gap`, `box-shadow` before blaming the images.
5. **A cropped asset has wrong proportions**
   - Check `<img>` width/height, `object-fit`, and container height before re-examining the crop box.

For a more complete debugging rhythm and decision criteria, see [references/pixel-alignment-playbook.md](references/pixel-alignment-playbook.md).

[Back to top](#quick-navigation)

## Output Format

Default deliverables:

- Main HTML file
- Any required cropped assets (if applicable)
- Brief note on which elements are kept as text and which use source image crops

If the task includes alignment verification, also deliver:

- Side-by-side comparison with the screenshot matching the source image dimensions
- Metric summary from `visual_diff.py`
- Diff image or overlay image (if useful for subsequent iteration)

[Back to top](#quick-navigation)

## References

- [references/pixel-alignment-playbook.md](references/pixel-alignment-playbook.md)
- [evals/evals.json](evals/evals.json)

[Back to top](#quick-navigation)

## Example Prompts

1. `Convert this PNG to HTML — desktop version at 1:1 scale matching the original dimensions, text must be selectable.`
2. `The layout looks close now, but can the three complex illustrations be cropped from the source? Please don't use the whole column as a background image.`
3. `I suspect the HTML differs from the original in the header and image crop areas — use the Python visual diff tool to tell me what's wrong.`

[Back to top](#quick-navigation)
