# Dev Module - Sequence Diagrams (Simplified)

Participants used in all diagrams:
- Client
- Your System
- digiKUNTZ System

## 1) `GET /dev/api-keys/:userId` (Admin)
```mermaid
%%{init: {'theme':'base','themeVariables': {'primaryColor':'#021d66','primaryBorderColor':'#021d66','primaryTextColor':'#ffffff','secondaryColor':'#F57C11','tertiaryColor':'#F57C11','lineColor':'#021d66','actorBkg':'#021d66','actorBorder':'#021d66','actorTextColor':'#ffffff','signalColor':'#021d66','signalTextColor':'#021d66'}}}%%
sequenceDiagram
autonumber
participant C as Client
participant YS as Your System
participant DS as digiKUNTZ System

C->>YS: Request admin API keys by userId
YS->>DS: Validate auth/admin + fetch user dev keys
DS-->>YS: Keys payload
YS-->>C: 200 OK
```

## 2) `GET /dev/my-key`
```mermaid
%%{init: {'theme':'base','themeVariables': {'primaryColor':'#021d66','primaryBorderColor':'#021d66','primaryTextColor':'#ffffff','secondaryColor':'#F57C11','tertiaryColor':'#F57C11','lineColor':'#021d66','actorBkg':'#021d66','actorBorder':'#021d66','actorTextColor':'#ffffff','signalColor':'#021d66','signalTextColor':'#021d66'}}}%%
sequenceDiagram
autonumber
participant C as Client
participant YS as Your System
participant DS as digiKUNTZ System

C->>YS: Request my API keys
YS->>DS: Validate auth + get/create dev keys
DS-->>YS: Keys payload
YS-->>C: 200 OK
```

## 3) `POST /dev/generate-key`
```mermaid
%%{init: {'theme':'base','themeVariables': {'primaryColor':'#021d66','primaryBorderColor':'#021d66','primaryTextColor':'#ffffff','secondaryColor':'#F57C11','tertiaryColor':'#F57C11','lineColor':'#021d66','actorBkg':'#021d66','actorBorder':'#021d66','actorTextColor':'#ffffff','signalColor':'#021d66','signalTextColor':'#021d66'}}}%%
sequenceDiagram
autonumber
participant C as Client
participant YS as Your System
participant DS as digiKUNTZ System

C->>YS: Generate new API keys
YS->>DS: Validate auth + verify user eligibility + create keys
DS-->>YS: New key pair
YS-->>C: 201 Created
```

## 4) `PUT /dev/reset-key`
```mermaid
%%{init: {'theme':'base','themeVariables': {'primaryColor':'#021d66','primaryBorderColor':'#021d66','primaryTextColor':'#ffffff','secondaryColor':'#F57C11','tertiaryColor':'#F57C11','lineColor':'#021d66','actorBkg':'#021d66','actorBorder':'#021d66','actorTextColor':'#ffffff','signalColor':'#021d66','signalTextColor':'#021d66'}}}%%
sequenceDiagram
autonumber
participant C as Client
participant YS as Your System
participant DS as digiKUNTZ System

C->>YS: Reset API keys
YS->>DS: Validate auth + rotate keys
DS-->>YS: Rotated key pair
YS-->>C: 200 OK
```

## 5) `PUT /dev/update-status`
```mermaid
%%{init: {'theme':'base','themeVariables': {'primaryColor':'#021d66','primaryBorderColor':'#021d66','primaryTextColor':'#ffffff','secondaryColor':'#F57C11','tertiaryColor':'#F57C11','lineColor':'#021d66','actorBkg':'#021d66','actorBorder':'#021d66','actorTextColor':'#ffffff','signalColor':'#021d66','signalTextColor':'#021d66'}}}%%
sequenceDiagram
autonumber
participant C as Client
participant YS as Your System
participant DS as digiKUNTZ System

C->>YS: Update API status (enable/disable)
YS->>DS: Validate auth + update dev status
DS-->>YS: Updated status
YS-->>C: 200 OK
```

## 6) `GET /dev/transaction`
```mermaid
%%{init: {'theme':'base','themeVariables': {'primaryColor':'#021d66','primaryBorderColor':'#021d66','primaryTextColor':'#ffffff','secondaryColor':'#F57C11','tertiaryColor':'#F57C11','lineColor':'#021d66','actorBkg':'#021d66','actorBorder':'#021d66','actorTextColor':'#ffffff','signalColor':'#021d66','signalTextColor':'#021d66'}}}%%
sequenceDiagram
autonumber
participant C as Client
participant YS as Your System
participant DS as digiKUNTZ System

C->>YS: Request transaction by id (headers + key)
YS->>DS: Validate keys + load transaction + refresh status if needed
DS-->>YS: Transaction status payload
YS-->>C: 200 OK
```

## 7) `GET /dev/transactions-list`
```mermaid
%%{init: {'theme':'base','themeVariables': {'primaryColor':'#021d66','primaryBorderColor':'#021d66','primaryTextColor':'#ffffff','secondaryColor':'#F57C11','tertiaryColor':'#F57C11','lineColor':'#021d66','actorBkg':'#021d66','actorBorder':'#021d66','actorTextColor':'#ffffff','signalColor':'#021d66','signalTextColor':'#021d66'}}}%%
sequenceDiagram
autonumber
participant C as Client
participant YS as Your System
participant DS as digiKUNTZ System

C->>YS: Request paginated transactions list
YS->>DS: Validate keys + fetch transactions (page/limit)
DS-->>YS: Data + pagination
YS-->>C: 200 OK
```

## 8) `POST /dev/transaction`
```mermaid
%%{init: {'theme':'base','themeVariables': {'primaryColor':'#021d66','primaryBorderColor':'#021d66','primaryTextColor':'#ffffff','secondaryColor':'#F57C11','tertiaryColor':'#F57C11','lineColor':'#021d66','actorBkg':'#021d66','actorBorder':'#021d66','actorTextColor':'#ffffff','signalColor':'#021d66','signalTextColor':'#021d66'}}}%%
sequenceDiagram
autonumber
participant C as Client
participant YS as Your System
participant DS as digiKUNTZ System

C->>YS: Create API payin transaction
YS->>DS: Validate keys + create transaction + init payin
DS-->>YS: txRef + payment link
YS-->>C: 201 Created
```

## 9) `GET /dev/balance`
```mermaid
%%{init: {'theme':'base','themeVariables': {'primaryColor':'#021d66','primaryBorderColor':'#021d66','primaryTextColor':'#ffffff','secondaryColor':'#F57C11','tertiaryColor':'#F57C11','lineColor':'#021d66','actorBkg':'#021d66','actorBorder':'#021d66','actorTextColor':'#ffffff','signalColor':'#021d66','signalTextColor':'#021d66'}}}%%
sequenceDiagram
autonumber
participant C as Client
participant YS as Your System
participant DS as digiKUNTZ System

C->>YS: Request user balance (headers + key)
YS->>DS: Validate keys + read balance
DS-->>YS: Balance payload
YS-->>C: 200 OK
```

