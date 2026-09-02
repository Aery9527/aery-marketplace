# Mermaid Diagram Examples

Per-type syntax examples for reference. Load this file when producing Mermaid diagrams.

---

## Flowchart (Module Dependencies / Pipeline)

Top-down for hierarchies:

```mermaid
flowchart TD
    Common["game-go-common<br/>Base Utilities"]
    Core["slot-core<br/>Game Engine"]
    Infra["game-go-infra<br/>Infrastructure"]
    Common --> Core
    Common --> Infra
    Core --> App["game-slot-gp-app<br/>Application Layer"]
    Infra --> App
```

Left-to-right for pipelines:

```mermaid
flowchart LR
    A["Parse Request"] --> B["Read State"]
    B --> C["Execute Game Logic"]
    C --> D["Update Balance"]
    D --> E["Write Record"]
    E --> F["Save State"]
    F --> G["Return Response"]
```

With subgraph grouping:

```mermaid
flowchart TD
    subgraph Common["game-go-common"]
        Glog["glog"]
        Gerror["gerror"]
        Gitem["gitem"]
    end
    subgraph Core["slot-core"]
        Engine["engine"]
        Cf["cf"]
    end
    Common --> Core
```

---

## Sequence Diagram (Component Interaction)

```mermaid
sequenceDiagram
    participant Client
    participant GinAdapter
    participant SpinEntry
    participant GameAction
    participant BalanceUpdater

    Client->>GinAdapter: HTTP Request
    activate GinAdapter
    GinAdapter->>SpinEntry: Parse & Spin()
    activate SpinEntry
    SpinEntry->>GameAction: Launch() / Next()
    activate GameAction
    GameAction-->>SpinEntry: SpinResult
    deactivate GameAction
    SpinEntry->>BalanceUpdater: UpdateBalance()
    BalanceUpdater-->>SpinEntry: ok
    SpinEntry-->>GinAdapter: FlowResult
    deactivate SpinEntry
    GinAdapter-->>Client: JSON Response
    deactivate GinAdapter
```

---

## Class Diagram (Interface / Struct Relationships)

```mermaid
classDiagram
    class GameAction {
        <<interface>>
        +Launch(ctx, params) SpinResult
        +Next(ctx, params) SpinResult
    }
    class MahjongAction {
        -config Config
        +Launch(ctx, params) SpinResult
        +Next(ctx, params) SpinResult
    }
    GameAction <|.. MahjongAction : implements

    class Symbol {
        <<interface>>
        +ID() int
        +Display() string
        +IsWild() bool
    }
    class BaseSymbol {
        -id int
        -display string
    }
    Symbol <|.. BaseSymbol : implements
```

---

## State Diagram (Game State / Lifecycle)

```mermaid
stateDiagram-v2
    [*] --> Idle
    Idle --> Spinning : Launch Spin
    Spinning --> Evaluating : Reels Stop
    Evaluating --> FreeGame : Trigger Free Game
    Evaluating --> Idle : No Special Trigger
    FreeGame --> Spinning : Next Spin
    FreeGame --> Idle : Free Game Ends
```

---

## ER Diagram (Data Model)

```mermaid
erDiagram
    USER ||--o{ ROUND : plays
    ROUND ||--|{ SPIN_RECORD : contains
    ROUND {
        string roundID PK
        string userID FK
        int gameID
        money totalBet
        money totalWin
    }
    SPIN_RECORD {
        string recordID PK
        string roundID FK
        int spinIndex
        json gridResult
        money winAmount
    }
```

---

## Type-Specific Syntax Rules

- In sequence diagrams, place `:` between each message receiver and its message text, and close every `alt`, `opt`, and `loop` block with a matching `end`.
- In sequence diagrams, message and `Note` text MUST NOT contain a bare semicolon (`;`): Mermaid treats it as a statement terminator and parses the remaining text as a new instruction. Use a period or `<br/>` instead.
- In class diagrams, enclose relationship cardinalities in double quotes and include `()` in every method signature, including zero-argument methods.
- In ER diagrams, write each attribute as `<type> <name>`, e.g. `string userId PK`; MUST NOT reverse the order.
- Pie-chart values MUST be greater than zero; non-positive values may be rejected or produce no visible slice, depending on the renderer.

---

## Combining Diagrams

When documenting a complex feature, use multiple diagram types in one document:

1. **flowchart** for the high-level architecture or module dependency
2. **sequenceDiagram** for the runtime interaction between components
3. **stateDiagram-v2** for any state machine or lifecycle
4. **classDiagram** for interface/struct type relationships if needed

Choose the minimum set of diagrams that fully conveys the feature. Avoid redundancy between diagrams.
