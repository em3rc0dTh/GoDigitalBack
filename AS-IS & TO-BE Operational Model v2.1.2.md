# GoDigital – AS-IS & TO-BE Operational Model v2.1
*From MERGED-CHUNK L1-A*_v1.9<br>
*From MERGED-CHUNK L1-B*_v2.0<br>
*From MERGED-CHUNK L1-C*_v2.1<br>
*Some adjustments made to improve both data model and workflow accuracy*_v2.1.1<br>
*Changes to include BusinessEntity and Resource*_v2.1.2<br>

## 1. Overview

This document consolidates the analysis and design work based on the two hand-drawn diagrams:

* **AS-IS:** Current reality of micro and small enterprises.
* **TO-BE:** Future reality after adopting the **GoDigital** platform.

It includes:

* Interpretations of both diagrams
* Clean diagram specifications
* Functional & non-functional requirements
* AS-IS and TO-BE narratives
* Data entities and flows
* Process flow descriptions
* High-level architecture
* Foundation schemas (conceptual)
* Draft master prompts for GoDigital

---

## 2. AS-IS Diagram – Interpretation

### 2.1 Elements

* **EMPRESA (blue frame):** The whole company.
* **Green processes (production side):**

  * `Prod. MFG ZAPATO` – manufacturing / production.
  * `Vender ZAPATO` – sales.
  * `Comprar INSUMOS` – purchasing.
* **Red processes (core):**

  * `Procesos CONT` – accounting.
  * `Procesos FINAC` – finance.
* **Pre-BASE (horizontal band):** An informal, semi-structured layer through which information sometimes passes (e.g., Excel, emails, chats, ad‑hoc lists).
* **Magenta arrows:** Data flows between green and red processes.

### 2.2 Meaning

* Each production process interacts **directly** with Accounting and Finance.
* Information moves in an **"all against all"** pattern (many-to-many connections).
* Data is:

  * Fragmented
  * Non-standardized
  * Often manually built by each process owner
* Accounting and Finance must **interpret and normalize** every input (dates, currencies, concepts, cost centers, etc.).
* This causes:

  * High admin load
  * Delays
  * Errors and inconsistencies
  * Poor visibility on profitability and cashflow
  * Strong dependency on a few key people who "understand the mess".

---

## 3. TO-BE Diagram – Interpretation

### 3.1 Elements

* **EMPRESA (blue frame):** Same company.
* **Green processes:** Same three production processes (MFG, Sales, Purchasing).
* **Red processes:** Same core functions (Accounting and Finance).
* **Magenta rectangle:** `GoDigital App SW` – GoDigital platform.
* **Arrows:**

  * From each green process to GoDigital.
  * From GoDigital down to Accounting and Finance.

### 3.2 Meaning

* Production processes **no longer send data directly** to Accounting and Finance.
* All operational information flows **through GoDigital**.
* GoDigital becomes the **single ingestion and normalization layer** where:

  * Data is validated and standardized.
  * Workflows are enforced.
  * Business rules are applied.
  * Transactions are mapped to projects, cost centers, and accounts.
* Accounting and Finance receive **pre-structured, normalized, auditable data**.
* The many-to-many chaos becomes a **many-to-one-to-two** pattern:

  * Many production processes → **GoDigital** → Accounting & Finance.
* Core processes shift from **data cleaning** to **analysis, planning, and decision-making**.

---

## 4. Clean Diagram Specifications

### 4.1 AS-IS Diagram – Spec for Clean Digital Version

**Canvas:**

* Big blue rectangle labeled `EMPRESA`.
* Horizontal blue line at mid-height labeled `Pre-BASE` on left.

**Top (Production):**

* Three green circles aligned horizontally:

  1. Left: `Prod. MFG (ZAPATO)`
  2. Center: `Vender (ZAPATO)`
  3. Right: `Comprar (INSUMOS)`

**Bottom (Core):**

* Two red circles centered horizontally below Pre-BASE line:

  1. Left: `Procesos CONT`
  2. Right: `Procesos FINAC`
* Red bidirectional arrow between them.

**Flows:**

* From **each** green circle, multiple magenta arrows going:

  * Directly to `Procesos CONT`.
  * Directly to `Procesos FINAC`.
* Some arrows may visually cross the Pre-BASE band to emphasize the lack of a formal layer.

**Legend:**

* Green: Production processes.
* Red: Core processes / data repositories.
* Magenta: Non-standardized data exchanges ("all against all").
* Label bottom right: `AS-IS`.

### 4.2 TO-BE Diagram – Spec for Clean Digital Version

**Canvas:**

* Same blue frame `EMPRESA` and `Pre-BASE` line.

**Top (Production):**

* Same three green circles (MFG, Sales, Purchasing).

**Middle (Pre-BASE transformed):**

* A magenta rounded rectangle on the Pre-BASE band labeled: `GoDigital App SW`.

**Bottom (Core):**

* Same two red circles: `Proc. CONT` and `Proc. FINAC` with red bidirectional arrow.

**Flows:**

* From each green circle, magenta arrows **only to the GoDigital rectangle**.
* From GoDigital, magenta arrows down to each red circle.
* No direct green→red arrows.

**Legend:**

* Green: Operational/production modules.
* Magenta rectangle: GoDigital platform (ingestion + normalization + workflow + analytics).
* Red: Core admin processes.
* Label bottom right: `TO-BE`.

---

## 5. Functional Requirements (GoDigital)

### 5.1 Bank Statement Ingestion & Normalization

1. The system shall ingest bank transactions from:

   * CSV/XLS exports
   * PDF statements (optional/advanced)
   * Bank APIs (where available)
2. The system shall normalize:

   * Date formats
   * Amount formats and currencies
   * Account identifiers
3. The system shall map raw operations to internal entities:

   * Bank account
   * Counterparty (client, supplier, employee)
   * Project / cost center
   * Transaction type (sale, purchase, expense, transfer, tax, etc.)
4. The system shall support multi-currency accounts and store base-currency conversions.
5. The system shall expose normalized transactions for accounting and finance modules via an internal API or shared data store.

### 5.1.1 Mass Payment (Pago Masivo) Detection & Semantic Override

During bank statement ingestion and normalization, the system shall explicitly identify/detect **Mass Payments (Pago Masivo)** — bank transactions that appear as a *single consolidated outflow* but internally represent **multiple economic obligations**.

A Mass Payment:

* it is kind of Administrative Payment and it is declared as such during the creation of the correspnding PaymentPequest,
* originates externally as a single bank debit,
* does NOT originate from an ExpenseRequest or CashRequest,
* may be incorrectly categorized by the bank (e.g., “pago de servicios”),
* requires **semantic override** by GoDigital when internal patterns indicate consolidation.

Detection signals may include (non-exhaustive):

* Administrative Payment request associated metadata with Mass Payment qualifier,
* known administrative providers (SUNAT, utilities, bundled service entities),
* transaction descriptions historically linked to decomposition,
* recurring consolidated debits,
* amount patterns inconsistent with single obligations.

When a transaction is identified / classified as a Mass Payment:

* the system shall set:
  * `is_mass_payment = true`
  * `requires_decomposition = true`
* the transaction SHALL NOT proceed to FULL consolidation
  until decomposition is completed and validated.

This logic applies during the **SOURCE → PARTIAL** enrichment stage.

### Recurrence as an Independent Semantic Dimension

A **recurring payment** is defined as a payment obligation that repeats over time according to a schedule or rule, **independently of how the payment is executed or classified at the bank level**.

Key clarifications:

- **Recurrence ≠ Mass Payment**  
  A recurring payment may be:
  - a single payment,
  - a mass payment,
  - an administrative payment,
  - or any other operational payment type.

- **Recurrence is a temporal property**, not an execution modality.
- Bank labels or transaction descriptions MUST NOT be used to infer recurrence.
- Recurrence is determined by:
  - internal scheduling rules,
  - historical repetition patterns,
  - or explicit recurrence configuration.

As a result, recurrence must be modeled and processed as a **first-class semantic attribute**, orthogonal to:
- mass payment classification,
- administrative vs operational payment type,
- bank-originated transaction semantics.

### Recurrence-Aware Reconciliation

Reconciliation logic must be aware of scheduled recurring obligations.

Specifically, the system must support:

- Detection of **missing executions**:
  - a recurrence rule exists,
  - no matching transaction is found within the tolerance window.

- Detection of **unexpected executions**:
  - a transaction occurs,
  - but no recurrence rule exists.

- Detection of **out-of-pattern executions**:
  - amount, date, or counterparty deviates beyond configured tolerances.

These cases must trigger:
- reconciliation warnings,
- review workflows,
- or administrative follow-up actions.

Recurrence-aware reconciliation improves:
- cashflow visibility,
- compliance,
- and operational predictability, without altering the underlying accounting correctness.

### 5.2 Expense Management (Gestión del Egreso)

1. Users shall be able to create **Payment Requests** including:

   * Beneficiary (person or organization)
   * Amount and currency
   * Project and/or cost center
   * Concept / category
   * Attachments (proof of payment, receipts, quotes)
2. The system shall support a two multi-step workflows:

   * (1) Inmediate Payment: Draft → Submitted → Approved (supervisor) → Authorized (administration/finance) → Paid (Payor) → Review (User) → Checked (Payor) → Closed.
   * (2) Scheduled Payment: Draft → Submitted → Approved (supervisor) → Authorized (administration/finance) → Scheduled (administration/finance) → Paid (Payor) → Review (User) → Checked (Payor) → Closed.

3. The system shall notify users of status changes.
4. The system shall allow upload of proof of payment (vouchers, bank confirmations).
5. The system shall maintain an immutable audit trail for each request.
6. The system shall produce a structured feed of **paid** transactions compatible with accounting entries.
7. The system shall allow administration/finance to **Cancel** any **Payment Request** in *Approved* or *Authorized* or *Scheduled* stages.

#### 5.2.1 Scheduled & Recurring Payment Planning

GoDigital must support **calendar-based planning** for recurring payment obligations.

This includes:

- Definition of recurrence rules:
  - frequency (monthly, quarterly, yearly, custom),
  - expected execution dates,
  - tolerance windows (early/late execution),
  - optional end conditions.

- A **calendarized view** of future expected payments, similar in behavior to a financial calendar:
  - visible to finance and administrative roles,
  - usable for cashflow forecasting,
  - independent of whether a payment has already been executed.

Important constraints:

- Scheduled recurring payments **do NOT automatically imply a PaymentRequest**. The **Payment Request** for a Scheduled or Recurring payment shall be created by system, according to the requested "payment date" or "due date".
- A scheduled obligation becomes an executed payment **only when a real transaction occurs** (bank transaction or internal execution).
- The scheduling layer exists to:
  - anticipate obligations,
  - detect missing or delayed executions,
  - support planning and reconciliation.

This scheduling capability applies equally to:
- administrative recurring payments,
- operational recurring payments,
- and recurring payments that may later be classified as mass payments.

> **NOTE — Semantic Boundary**
>
> Scheduled and recurring payments represent **planning and intent**, not execution.
>
> Defining a schedule does NOT:
> - trigger automatic payment,
> - bypass approval flows,
> - guarantee bank execution,
> - create accounting records.
>
> Execution, approval, and accounting remain governed by their respective pipelines.


### 5.3 Project Management / Project Accounting

1. Users shall be able to create **projects**, with:

   * Project ID and name
   * Client (optional)
   * Linked purchase order (optional)
   * Start date (mandatory) and end date (optional)
   * Project type (commercial / internal)
2. Users (administration/finance) shall be able to assign one or more **budgets** to each project.
3. The system shall associate:

   * Expense requests
   * Cash requests
   * Bank transactions
   * Proof Of Payment documents
   * Projects (specific project)

  3.1 Mass Payment Allocation Impact on Projects & Budgets

When a Mass Payment is decomposed:

* each allocation item SHALL be treated as an independent economic impact,
* each allocation may affect:
  * a different Project,
  * a different Business Unit.

Project accounting calculations (cost aggregation, budget consumption, margin analysis) MUST operate on **decomposed allocation items**, not on the original consolidated bank transaction.

A single Mass Payment may therefore:

* reduce multiple project budgets,
* appear as multiple cost lines in project profitability,
* remain traceable to a single external bank debit for audit purposes.
							
4. The system shall provide per-project KPIs:

   * Total revenue
   * Total costs (direct and indirect where applicable)
   * Margin and profitability
   * Budget vs. actual.

### 5.4 Integration with Production Processes

1. The system shall expose **simple, task-oriented UIs** (or APIs) for:

   * Purchasing (e.g., register purchase, link to supplier, project, category).
   * Sales (e.g., register sale, link to customer, product, service, project).
   * Production (e.g., register production batch, material usage, project association).
2. All production-side interactions shall be validated and stored using **shared schemas**.
3. No production-side process shall write directly to accounting/finance repositories; they must go through GoDigital logic.

### 5.5 Accounting & Finance Interfaces

1. Accounting users shall access:

   * Normalized transaction lists
   * Pre-classified suggestions for GL accounts
   * Export options to existing ERPs or accounting tools.
2. Finance users shall access:

   * Cashflow views (historic and projected)
   * Payment pipeline (approved / authorized / pending / paid)
   * Budget vs. actual per project and globally.

### 5.6 Cross-Cutting Requirements

1. Role-based access control (RBAC) for all modules.
2. Full audit logging of changes and approvals.
3. Configurable company parameters (currencies, fiscal periods, chart of accounts, etc.).
4. Multi-company capability (optional/advanced).

---

## 6. Non-Functional Requirements (High-Level)

1. **Usability:** Interfaces must be simple enough for non-experts (typical SME owner/manager).
2. **Performance:** UI actions should respond in under ~1 second for standard operations.
3. **Security:**

   * Encrypted data at rest and in transit.
   * Strong authentication and access control.
4. **Reliability:**

   * High availability of core features (ingestion, requests, project views).
5. **Auditability:** Every financial-relevant change must have traceable user/time/context.
6. **Extensibility:** Architecture should support plugging in new modules (e.g., invoicing, inventory) later.

---

## 7. AS-IS Narrative (Story Form)

In the current (AS-IS) reality, the SME runs three key production processes: manufacturing, sales, and purchasing. Each process maintains its own spreadsheets, notes, and ad hoc report formats. When month-end arrives, accounting requests information: lists of purchases, sales, expenses, and outstanding payments. Each area responds in its own way – one sends a spreadsheet with columns in a different order, another sends a PDF, another just sends WhatsApp screenshots.

Accounting and finance must then interpret all this information, manually normalize dates and currencies, guess cost centers, and reconcile contradictions. The same transaction can appear differently in separate sources. Closing the month is slow and stressful. Management decisions are made late and often based on incomplete data. The business owner has no real-time view of profitability by project or of future cash constraints.

This is the "all against all" world: many uncontrolled point‑to‑point flows, high friction, and no shared language.

---

## 8. TO-BE Narrative (Story Form)

In the TO-BE reality with GoDigital, the production teams still manufacture, sell, and purchase – but they register their actions directly into a simple, guided application. When a purchase is made, the purchasing user logs it in GoDigital: supplier, proof of payment, project, and payment terms. When a sale occurs, the salesperson records the sale, links it to a client and project, and GoDigital automatically prepares the corresponding financial impact. Regardless the nature of the operation (sales, purchase, tax, etc.) and the input channel and format (email with PDF attachement, WhatsApp message with screenshots, etc.) GoDigital will be there to ease the data intake and classify/match accordingly.

Bank transactions are imported automatically, and GoDigital matches them with registered sales, purchases, and payment requests. Expense requests follow a standardized workflow with clear approval and authorization steps. All data flows into a normalized, structured repository.

Accounting no longer chases people for spreadsheets; instead, they open GoDigital and see a list of pre-classified transactions ready for posting. Finance views current and projected cash positions, per project and globally. The owner can check a dashboard and instantly see which projects are profitable, which expenses are growing faster than expected, and how much cash will be needed next month.

The company has not added new people – it has added **structure and intelligence**.

---

## 9. Data Entities & Relationships (Conceptual)

### 9.1 Core Entities

* **Company**
* **User** (with Role)
* **Role** (permissions)
* **BankAccount**
* **BankTransaction**
* **Vendor**
* **Customer**
* **Product**
* **Project**
* **Budget**
* **PaymentRequest**
* **CashRequest**
* **Payment** (executed payment)
* **ProofOfPayment** (a specific type of document that can be either "invoice" or "sales note" type and issued by a Vendor)
* **PurchaseRequest** (for the purchase of goods or services required by the Company)
* **SalesRequest** (for selling the products (goods/services) produced/offered by the Company)
* **Document** (attachments other than ProofOfPayment)
* **GLAccount** (for accounting integration)
* **CostCenter** (can be mapped to Project or other dimensions)
* **Currency** & **ExchangeRate**
* **ExpenseRequest**

### 9.2 Key Relationships (Textual)

* A **Company** (also known as "Business Entity") has many Employees, Contractors, BankAccounts, Projects, Suppliers, Customers, Products, Business Units.
* A User (System User) when related to a particular Business Entity must be an employee or Contractor of such Business Entity.
* A **Project** may belong to one Company and may link to one Customer and optionally one Purchase Order.
* A **Budget** belongs to one Project.
* A **PaymentRequest**, **ExpenseRequest** and **CashRequest** belongs to one Project and one Company, and references one or more Documents.
* A **PurchaseRequest** * belongs to one Project and one Company, and references one or more Documents. These are similar in nature to `PaymentRequest` but its usage is allowed to `supervisor`,and `administration/finance` roles only because of the bigger amount of money this operations can handle. 
* A **Payment** is linked to one Operational Payment (via one Purchase Request or one PaymentRequest or one CashRequest) and in turn shall produce one BankTransaction (RAW).
* A **Payment** is linked to one Administrative Payment (via one Purchase Request or one PaymentRequest or one CashRequest) and in turn shall produce one BankTransaction (RAW).
* A **BankTransaction RAW** belongs to one BankAccount and may be matched to:

  * one PaymentRequest, or one PurchaseRequest or one ExpenseRequest, or one CashRequest, and
  * one ProofOfPayment (one Invoice or one Sales Note) and
  * one generic category (e.g., tax, fee).
* A **GLAccount** can be mapped to rules that classify BankTransactions, ExpenseRequests, PurchseRequest, PaymentRequests and CashRequests for export.

---

## 10. Data Flow Scenarios (Simplified)

### 10.1 Purchasing Inputs

1. User creates Purchase Request in GoDigital (supplier, products, project, terms).
2. If payment is immediate, GoDigital creates an PurchaseRequest.
3. PurchaseRequest follows approval/authorization workflow.
4. Payment is executed and a BankTransaction is imported.
5. GoDigital matches the payment to the PurchaseRequest.
6. Accounting exports a ready-to-post entry.

### 10.2 Selling Products

1. User (Salesperson) creates a SaleRequest (customer, products, project, price, taxes).
2. GoDigital expects a bank inflow for this sale.
3. When the BankTransaction arrives, GoDigital proposes a match.
4. Revenue is allocated to the right project and GL accounts.

### 10.3 Project Profitability

1. All related purchases, expenses, and sales for a project are tagged with the Project ID.
2. GoDigital aggregates:

   * Revenue
   * Direct costs
   * Indirect allocations (if configured)
3. The system displays margin and budget vs. actual.

---

## 11. Process Flow Descriptions (Textual BPMN)

### 11.1 Expense Request Workflow

* **Start:** User needs to pay something.
* Step 1: User creates ExpenseRequest (Draft).
* Step 2: User submits → status `Submitted`.
* Step 3: Supervisor review → `Approved` or `Rejected`.
* Step 4: If Approved → Administration/Finance review → `Authorized` or `Rejected`.
* Step 5: If Authorized → Administration/Finance may branch to: (1) Inmediate Payment workflow (to execute payment) or (2)Scheduled Payment workflow (for future payment) → status `scheduled`. when the "scheduled date" comes the ExpenseRequest will be released for payment.
* Step 6: When Authorized → Payor executes payment → `Paid`.
* Step 7: System notifies the User that the payment has been executed.
* Step 8: ExpenseRequest is send back to User bin for Proof of payment attachement.
* Step 9: Begining of "Review Loop". User attaches the "Proof of Payment" and submits → status `Review`.
* Step 10: Payor reviews → `Checked` or `Reverted`. If `Reverted` the Payor must declare the reasons for reversion. The System stores the reason for reversion and notifies the User that the payment has been reverted.
* Step 11: ExpenseRequest is send back to User bin to solve the issue (reason for reversion) associated to Proof of payment attachement.
* Step 12: User fixes the issue and submits the ExpenseRequest with updated Proof of payment attachement → status `Review`. The System loops until the issue is fixed or Payor escalates the matter to Administration/Finance. End of "Review Loop".
* Step 13: If Payor review (of Proof of payment attachement) is  `Checked` → System notifies the User and sets ExpenseRequest state to `Closed`.
* **End.**

#### Expense Request and Payment Request application scenarios

- **Payment Request**, refers to a direct appeal for money owed, due to work completed, goods provided, or services rendered. It is a broad term that can encompass a wide variety of financial obligations and often comes in the form of an **invoice**. The key focus is simply the request for funds to be transferred from one entity to another.
- **Expense Request**, more specifically, refers to a claim for reimbursement of costs already incurred by an individual (usually an employee) on behalf of an organization. The person has already spent their own money and is now requesting that the company pay them back. This process typically involves submitting a formal expense report with receipts and documentation to justify the expenditure. 

**Payment Request** and **Expense Request** use a similar workflow (see section 11.1 Expense Request Workflow). The only difference is the associated "application scenario" either **Payment** or **Expense**.

### 11.2 Bank Ingestion & Matching

* **Start:** New bank file/API data available.
* Step 1: Import raw transactions.
* Step 2: Normalize fields.
* Step 3: Apply matching rules (to ExpenseRequests, ProofOfPayment, Projects).
* Step 4: Flag unmatched transactions for manual review.

#### Recurrence-Aware Reconciliation Check

Before exposing transactions to Accounting & Finance, the system performs a recurrence-aware reconciliation pass:

- Transactions linked to recurrence patterns are evaluated against:
  - expected execution dates,
  - tolerance windows,
  - historical execution behavior.

- Missing or anomalous executions are flagged explicitly as **reconciliation exceptions**, not silently ignored.

This step ensures that **calendar planning does not distort financial truth**, and that recurrence logic remains observational rather than prescriptive.


* Step 5: Expose normalized set to Accounting & Finance.
* **End.**

---

## 12. High-Level Architecture (Conceptual)

### 12.1 Layers

1. **Presentation Layer**

   * Web UI for users (production, admin, management).
2. **Application Services Layer**

   * Modules:

     * Bank Ingestion Service
     * Expense Management Service
     * Project Management Service
     * Matching & Reconciliation Service
     * Reporting & Analytics Service
3. **Domain Layer**

   * Entities listed in Section 9.
   * Business rules for workflows, matching, validation.
4. **Infrastructure Layer**

   * Persistence (e.g., MongoDB collections).
   * Integrations (bank APIs, email/notifications, external ERP export).

### 12.2 Position of GoDigital Platform

GoDigital sits between **production systems** and **core admin systems**, acting as a **Pre-Base with intelligence**:

Production → GoDigital (Pre-Base) → Accounting / Finance / ERP.

---

## 12.5 Bank Transaction Pipeline (RAW → SOURCE → PARTIAL → FULL)

### Overview

GoDigital will persist **all four levels** of transaction representations to ensure:

* auditability
* traceability
* recoverability
* regulatory compliance
* debugging & support for SMEs
* ability to reprocess logic as the system evolves

### Transaction Tiers

#### 1. RAW Transaction (Landing Zone)

Raw, unmodified transaction exactly as delivered by the bank.

* Stored per bank account
* Immutable
* Minimum metadata

#### 2. SOURCE Transaction (Normalized Transaction)

Normalized and canonicalized version of RAW.

* Each SOURCE transaction is provided with an UUID. The UUID is build by the concatenation of the bank account number (with trailing zero at the begining of the string and without special characters) plus the date and time of the operation as reported by the bank. See example: `0013456789789_2025-10-31T17:06:00`
* Standard field formats
* Currency and date normalization
* Per-account lists

#### 3. PARTIAL Transaction (Business-Enriched Transaction)

SOURCE transaction augmented with:

* Associations (payment request, project, business unit)
* Classifications (operation type, semantic category)
* Matching rules output

##### 3.1 Mass Payment Interception in PARTIAL Stage

During the PARTIAL Transaction stage, the system must explicitly intercept transactions classified as Mass Payments.

If a transaction satisfies Mass Payment conditions:

* `is_mass_payment = true`
* `requires_decomposition = true`

Then:

1. The PARTIAL transaction enters a **blocked enrichment state**.
2. The system requires user-driven decomposition into allocation items.
3. Each allocation item must specify:
   * amount and percentage,
   * project,
   * business unit,
   * beneficiary entity.
4. System validation ensures:
   * total allocation equals original transaction amount.
5. Only after successful validation may the transaction proceed to FULL consolidation.

A Mass Payment without approved decomposition is considered **incomplete** and MUST NOT generate accounting-ready outputs.

#### Recurrence Detection & Binding in the Bank Pipeline

Recurrence handling interacts with the bank pipeline as follows:

- **Recurrence is identified at RAW stage.**
- Recurrence binding occurs at the **RAW stage**, where:
  - bank transactions are associated with a particular Payment (either Administrative or Operational)

At the PARTIAL stage, the system must:

- Evaluate whether a transaction matches an existing **recurrence rule**.
- Bind the transaction to a recurring obligation if:
  - execution date aligns with a scheduled window,
  - amount and counterparty fall within configured tolerances,
  - and recurrence rules explicitly allow matching.

Important:

- A transaction may be recurrent **even if it is the first observed execution**, if a recurrence rule was pre-configured.
- A transaction may be non-recurrent even if it resembles previous payments, unless recurrence rules confirm it.

The result of this stage is the explicit setting of recurrence-related semantic flags, without mutating bank-originated data.

#### Reconciliation & Exception Handling (Recurrence-Aware)

Once a transaction has been identified as potentially linked to a **recurrence pattern**, reconciliation must explicitly account for **calendar expectations**, **temporal variance**, and **execution uncertainty**.

The system MUST evaluate the following reconciliation scenarios:

1. **Expected execution not observed**
   - A recurrence instance exists for a given period.
   - No corresponding bank transaction is detected within the expected execution window.
   - Result:
     - The recurrence instance is marked as *pending / missed*.
     - No synthetic transaction is created.
     - The case is surfaced as a reconciliation exception.

2. **Observed execution without expected recurrence**
   - A bank transaction is detected that matches recurrence-like characteristics.
   - No recurrence instance was scheduled for that period.
   - Result:
     - The transaction proceeds through normal classification.
     - A recurrence linkage is NOT auto-created.
     - A reconciliation warning is attached for review.

3. **Temporal drift**
   - A bank transaction matches a recurrence instance but falls outside the nominal calendar window.
   - Result:
     - The match is considered *weak*.
     - The transaction remains eligible for FULL promotion only after validation.
     - Drift metadata is preserved for auditability.

4. **Amount or beneficiary deviation**
   - The transaction timing matches a recurrence instance but financial attributes differ.
   - Result:
     - The recurrence instance is flagged as *partially matched*.
     - The transaction is NOT force-merged.
     - Manual review or rule-based tolerance may apply.

IMPORTANT:
- Recurrence awareness must **never bypass accounting validation**.
- Reconciliation logic remains conservative by default.
- Recurrence adds *context*, not *authority*.

#### 4. FULL Transaction (Company-Wide Consolidated Transaction)

PARTIAL transaction enriched with consolidation header:

* Bank name
* Bank account & number
* SOURCE currency & amount
* Exchange rate used
* PROCESS currency
* PROCESS amount

A single FULL Transaction List exists per company.

---

## 13. Foundation Schemas (Conceptual JSON-like)

These are logical schemas, not strict implementations.

### 13.1 PaymentRequest

```json
{
  "id": "string",
  "company_id": "string",
  "requester_id": "string",
  "project_id": "string",
  "beneficiary_type": "vendor|supplier|other",
  "beneficiary_id": "string",
  "currency": "string",
  "payable amount": "number",
  "payable amount_inc_igv": "boolean",
  "concept": "string",
  "category": "string",
  "status": "draft|submitted|approved|authorized|paid|closed|rejected|cancelled|scheduled",
  "created_at": "datetime",
  "updated_at": "datetime",
  "approved_by": "string|null",
  "authorized_by": "string|null",
  "paid_by": "string|null",
  "attachments": ["document_id"],
  "audit_log": [
    {
      "timestamp": "datetime",
      "user_id": "string",
      "action": "string",
      "details": "string"
    }
  ]
}
```

### 13.2 Project

```json
{
  "id": "string",
  "company_id": "string",
  "name": "string",
  "type": "commercial|internal",
  "client_id": "string|null",
  "purchase_order_ref": "string|null",
  "start_date": "date",
  "end_date": "date|null",
  "status": "planned|active|on_hold|closed",
  "budgets": [
    {
      "id": "string",
      "currency": "string",
      "amount": "number",
      "created_at": "datetime"
    }
  ]
}
```

### 13.3 BankTransaction

```json
{
	"id": "string",
	"company_id": "string",
	"bank_account_id": "string",
	"operation_date": "date",
	"value_date": "date",
	"amount": "number",
	"currency": "string",
	"amount_base_currency": "number",
	"exchange_rate_used": "number",
	"description_raw": "string",
	"normalized_type": "sale|purchase|transfer|fee|tax|other",
	"matched_entity": [
		{
			"entity_id": "string",
			"entity_type": "string"  //"expense_request|proof_of_payment|other|null"
		}
	],
	"project_id": "string|null",
	"status": "imported|matched|review_required",
	"source_file_id": "string|null"
}
```

#### Mass Payment & Decomposition Attributes (Extension)
Extend the existing BankTransaction schema by adding the following fields, without removing any existing ones.

```json
{
  "is_mass_payment": "boolean",            // indicates consolidated external payment
  "requires_decomposition": "boolean",     // mandatory when is_mass_payment = true
  "is_recurring": "boolean|null",          // optional, reused by recurrence logic
  "decomposition_items": [
    {
      "description": "string",
      "amount": "number",
      "percentage": "number|null",
      "project_id": "string",
      "business_unit_id": "string",
      "entity_id": "string"
    }
  ]
}
```

These attributes are populated during the SOURCE → PARTIAL stage and validated before FULL consolidation.



### 13.4 User & Role (simplified)

```json
{
  "User": {
    "id": "string",
    "company_id": "string",
    "name": "string",
    "email": "string",
    "role_id": "string",
    "is_active": "boolean"
  },
  "Role": {
    "id": "string",
    "name": "string",
    "permissions": ["string"]
  }
}
```

### 13.5 ExpenseRequest

```json
{
  "id": "string",
  "company_id": "string",
  "requester_id": "string",
  "project_id": "string",
  "beneficiary_type": "contractor|employee|other",
  "beneficiary_id": "string",
  "currency": "string",
  "payable amount": "number",
  "payable amount_inc_igv": "boolean",
  "concept": "string",
  "category": "string",
  "status": "draft|submitted|approved|authorized|paid|closed|rejected|cancelled|scheduled",
  "created_at": "datetime",
  "updated_at": "datetime",
  "approved_by": "string|null",
  "authorized_by": "string|null",
  "paid_by": "string|null",
  "attachments": ["document_id"],
  "audit_log": [
    {
      "timestamp": "datetime",
      "user_id": "string",
      "action": "string",
      "details": "string"
    }
  ]
}
```

---

## 14. Draft Master Prompts (for GoDigital Design & AI Support)

### 14.1 Global GoDigital System Prompt (Conceptual)

"""
You are **GoDigital**, an Operational Intelligence assistant for micro and small enterprises. Your purpose is to help users manage projects, expenses, and financial flows using the GoDigital data model.

Given any input about purchases, sales, expenses, projects, or bank transactions, you must:

1. Map the information to the core entities: Project, ExpenseRequest, BankTransaction, Supplier, Customer.
2. Enforce the standard workflow rules (e.g., expense approvals, authorizations).
3. Normalize dates, currencies, and concepts according to the company configuration.
4. Maintain an auditable history of decisions and changes.
5. Produce outputs that accounting and finance can use directly, without additional cleaning.
   """

### 14.2 Master Prompt – Expense Management

"""
You manage the **Expense Request Workflow** for an SME.

When a user describes an expense or payment need:

* Extract: beneficiary, amount, currency, project, category, due date, and attachments.
* Create or update an ExpenseRequest object following the foundation schema.
* Determine the next workflow state (draft, submitted, approved, authorized, paid, closed) based on the actor and context.
* Ask only for information that is missing and strictly necessary to move forward.
* Output a structured summary and the updated ExpenseRequest.
  """

### 14.3 Master Prompt – Bank Transaction Matching

"""
You assist in matching **bank transactions** to internal records.

Given a list of BankTransactions and candidate ExpenseRequests or ProofOfPayment (Invoices/Sales Notes):

* For each transaction, propose the most likely match.
* Explain the reasoning (amount similarity, date proximity, beneficiary name, project, etc.).
* Flag ambiguities and suggest questions the user should answer.
* Never invent Payments or ProofOfPayment that do not exist in the data.
* Output a list of matches and unmatched items that require manual review.
  """

> **Constraint — Recurrence Awareness**
>
> When performing bank transaction matching:
>
> - Recurrence indicators must not override confidence scoring.
> - Recurrence patterns must not force matches.
> - Accounting validation always supersedes scheduling intent.
>
> Recurrence is context, not authority.



### 14.4 Master Prompt – Project Profitability Analysis

"""
You analyze the profitability of projects.

Given data about revenue, expenses, and budgets for one or more projects:

* Aggregate values per project.
* Compute margin, ROI, and budget vs. actual.
* Highlight anomalies (e.g., projects with high cost but low revenue, or expenses exceeding budget).
* Provide concise, actionable insights that a small business owner can understand.
  """

---

This document can be iterated and refined as we continue to develop the GoDigital project."}

## 15. Entity Definition: Business Unit (BU)

### 15.1 Description

A **Business Unit (BU)** is a semi-autonomous organizational subdivision within a company. It operates as a distinct managerial and operational structure with its own strategic objectives, resource allocations, and performance metrics. In the context of GoDigital, a BU serves as a major **classification and analytical dimension** for transactions, projects, expenses, and financial results.

BUs help structure the company’s economic activity so that profitability, cost distribution, and operational performance can be analyzed clearly and consistently.

### 15.2 Key Characteristics

* **Autonomy:** Each BU may operate with its own leadership, P&L responsibility, and operational processes.
* **Specialization:** Focused on a defined segment (e.g., product line, region, service line, or internal corporate support).
* **Strategic Alignment:** BU strategies remain consistent with overall enterprise objectives.
* **Clear Accountability:** Performance of each BU is measured distinctly, enabling granular decision-making.
* **Area Structure:** A BU contains **Areas**, which represent subdivisions, departments, or operational segments within that BU.

### 15.3 Entity Schema (Conceptual)

```json
{
  "id": "string",           // UUID
  "company_id": "string",   // each BU belongs to one company
  "name": "string",          // unique key per company
  "description": "string",   // optional narrative
  "areas": [                 // list of areas within the BU
    {
      "id": "string",
      "name": "string",     // unique within BU
      "description": "string|null"
    }
  ],
  "is_active": "boolean",
  "created_at": "datetime",
  "updated_at": "datetime"
}
```

### 15.4 Business Rules

1. **Name Uniqueness:** BU names must be unique within a company.
2. **Areas Unique Within BU:** Area names cannot repeat within the same BU.
3. **BU as Analytical Dimension:** Every Project, Expense Request, and Transaction may be optionally linked to a BU.
4. **Mandatory for PARTIAL→FULL Enrichment:** PARTIAL Transactions are enriched with a Business Unit when:

   * linked Expense Request has a BU, **or**
   * linked Project has a BU, **or**
   * classification rules infer a BU.
5. **BU Lifecycle:** BUs can be deactivated but cannot be deleted if referenced by any entity.

### 15.5 Relationship Notes

* **BU → Areas:** one-to-many.
* **BU → Projects:** optional one-to-many.
* **BU → ExpenseRequests:** one-to-many.
* **BU → FULL Transactions:** not stored directly; inferred through PARTIAL.

### 15.6 Example

```json
{
  "id": "bu-001",
  "company_id": "comp-01",
  "name": "Manufactura",
  "areas": [
    {"id": "area-01", "name": "Corte"},
    {"id": "area-02", "name": "Costura"},
    {"id": "area-03", "name": "Armado"}
  ],
  "is_active": true
}
```

## 16. Entity Definition: Service Offering

### 16.1 Description

A **Service Offering** represents a clearly defined product or service that a company delivers to its customers. It is the operational manifestation of a Business Unit’s value proposition and defines *what value is delivered, to whom, and how*. Service Offerings provide structure for marketing, sales, delivery, and financial planning.

Service Offerings allow SMEs using GoDigital to:

* organize their catalog of services,
* align projects with strategic value streams,
* allocate budgets coherently,
* and analyze profitability at the service level.

### 16.2 Role in the Enterprise Operating Model

Service Offerings sit between **Business Units** and **Projects**:

* **Business Units** define strategy, customers, and value direction.
* **Service Offerings** define *actual packages or services* delivered to customers.
* **Projects** create, enhance, or deliver these offerings.

This creates a structured value chain:

**BU → Service Offering → Projects → Execution → Value Creation**

### 16.3 Key Characteristics

* **Strategic alignment:** Derived from BU strategy.
* **Clarity of scope:** Each offering describes a specific, market-facing value.
* **Catalog-driven:** Service Offerings form the company’s service catalog.
* **Project-linked:** New offerings or improvements are executed through Projects.
* **Budget relevance:** Offerings influence portfolio budget allocation.

### 16.4 Entity Schema (Conceptual)

```json
{
  "id": "string",               // UUID
  "company_id": "string",       // owning company
  "business_unit_id": "string", // BU responsible for this offering
  "name": "string",              // unique per company
  "description": "string",       // detailed explanation
  "features": ["string"],        // list of value features
  "expected_outcomes": ["string"],
  "is_active": "boolean",
  "created_at": "datetime",
  "updated_at": "datetime"
}
```

### 16.5 Business Rules

1. **Name Uniqueness:** A company cannot have two Service Offerings with the same name.
2. **BU Link Mandatory:** All Service Offerings must belong to exactly one BU.
3. **Project Association:** A Project may be associated with zero or one Service Offering, depending on purpose.
4. **Catalog Integrity:** Deactivation is allowed; deletion only if no Projects reference the offering.

### 16.6 Relationships

* **BusinessUnit → ServiceOfferings:** one-to-many.
* **ServiceOffering → Projects:** optional one-to-many.
* **Projects → Budgets:** project inherits strategic alignment from its Service Offering.

---

## 17. Relationship Definition: Projects & Budgets (Strategic & Financial Link)

### 17.1 Overview

Projects are the tactical execution mechanism of the enterprise. Budgets are the **financial enabler** and **control mechanism** that allow projects to exist and operate. Together, they form the operational-financial alignment required for disciplined value creation.

### 17.2 Core Principles

* **Budget enables the project.** No project can be executed without an approved budget.
* **Projects justify the budget.** Each project must justify its request inside the broader company strategy.
* **BUs prioritize budgets.** Business Units determine which Service Offerings and Projects get funded.
* **Financial control:** Budgets define constraints, while actual spending is monitored against these constraints.
* **Performance measurement:** Budgets provide the baseline for CPI, cost variance, ROI, and profitability.

### 17.3 Entity Relationships

* **Company → Budget:** The company owns the total budget pool.
* **Budget → Project:** One budget per project (with possible multiple allocations over time).
* **Project → Service Offering:** A project supports or creates a Service Offering.
* **Service Offering → BU:** The offering belongs to a specific Business Unit.

This forms the chain:

**Company Budget → BU → Service Offering → Project → Execution → Costs → Financial Results**

### 17.4 Budget Entity Schema (Expanded)

```json
{
  "id": "string",
  "company_id": "string",
  "project_id": "string",          // mandatory link
  "service_offering_id": "string",  // derived via project (optional direct link)
  "currency": "string",
  "allocated_amount": "number",
  "approved_by": "string",
  "approved_at": "datetime",
  "notes": "string|null",
  "is_active": true,
  "created_at": "datetime",
  "updated_at": "datetime"
}
```

### 17.5 Budget Governance Rules

1. **Mandatory for Project Start:** A project cannot be set to `active` without an approved budget.
2. **Incremental Budgets:** Additional allocations can be added; all are tracked historically.
3. **Immutable Approval Log:** Approval details cannot be edited after the fact.
4. **Multi-Currency Support:** Budgets may be in currencies different from the company base currency.
5. **Integration With Expenses:** Every ExpenseRequest tied to a project reduces budget availability.

### 17.6 Example

```json
{
  "id": "budg-101",
  "company_id": "comp-01",
  "project_id": "proj-202",
  "service_offering_id": "svc-05",
  "currency": "USD",
  "allocated_amount": 50000,
  "approved_by": "usr-11",
  "approved_at": "2025-01-10T09:00:00Z",
  "is_active": true
}
```

## 18. Entity Definition: Entity (Legal & Business Counterpart)

### 18.1 Description

An **System Entity** represents any external or person that interacts financially or contractually with the Tenant and specifically with one (or more) of it's Business Entity. In GoDigital, this is a unified abstraction covering suppliers, customers, banks, contractors, ISPs, government agencies, and natural persons.

This generalization eliminates the need for multiple separate constructs (“supplier”, “customer”, “bank”, etc.) and consolidates them into a single, flexible structure.


### 18.2 Purpose in GoDigital

* Acts as the **universal counterpart** for:

  * Expense Requests
  * Payments
  * Bank Transaction Matching
  * Projects (client link)
  * Service Offering consumers
* Supports classification and analytics
* Enables consistent normalization across transaction tiers


### 18.3 Key Subclass Dimensions

An Entity is defined by three major classification systems:

#### (1) **system-entity-class**  (what economic role it plays)

Examples:

* vendor
* customer
* landlord
* investor
* associate

An Entity may have **multiple entity-classes**, e.g.:

* A contractor who is both *vendor* and *customer*
* A bank that is a *vendor* with *vendor_type* equal to *provider* and *business_type* equal to *banking* and collects payments for the services it provides (banking fees)

#### (2) **legal-class**

Defines the legal nature:

* **legal-entity**  (company, institution)
* **natural-entity** (individual, sole proprietor)

#### (3) **business-type**

Sector or specialization:

* banking
* internet service provider
* health care
* telecom
* construction
* retail
* professional services
* manufacturing

This enables filtering, classification, and automated matching.

#### (4) **vendor-type** (optional subtype for vendors)

Examples:

* supplier, that has a primary offering (service offering) of tangible goods (raw materials, parts, components).
* provider, that has a primary offering (service offering) of Intangible services (telecom, utilities, consulting, logistics, software access).

### 18.4 Entity Schema (Conceptual)

```json
{
  "id": "string",                        // UUID
  "company_id": "string",                // owning company
  "name": "string",                      // key, unique within company
  "entity_classes": ["string"],          // e.g. ["vendor", "investor", "colaborator"]
  "legal_class": "legal-entity|natural-entity",
  "business_type": "string|null",        // e.g. "bank" or "internet service provider" or "health care"
  "vendor_type": "string|null",          // e.g. one of two: "provider" or "supplier"
  "identifiers": {
    "tax_id": "string|null",            // legal identifier
    "national_id": "string|null",       // for individuals
    "registration_number": "string|null"
  },
  "contact": {
    "email": "string|null",
    "phone": "string|null",
    "address": "string|null"
  },
  "is_active": "boolean",
  "created_at": "datetime",
  "updated_at": "datetime"
}
```

### 18.5 Business Rules

1. **Name must be unique** per company.
2. An Entity must have at least **one entity-class**.
3. An Entity must specify **legal-class** (natural or legal).
4. Entity-classes are additive; an entity may play multiple roles.
5. Entities cannot be deleted if referenced by:

   * Projects
   * Expense Requests
   * PARTIAL or FULL Transactions
   * Service Offerings (client)
6. Entity changes must preserve auditability.

### 18.6 Relationships

* **Entity → Expense Requests:** one-to-many (as beneficiary).
* **Entity → Projects:** (as client).
* **Entity → Bank Transactions:** indirect via matching.
* **Entity → Service Offerings:** zero or many (customer).
* **Entity → Business Units:** none directly.

### 18.7 Example

```json
{
  "id": "ent-908",
  "company_id": "comp-01",
  "name": "Banco Continental",
  "entity_classes": ["vendor", "customer"],
  "legal_class": "legal-entity",
  "business_type": "banking",
  "vendor_type": "provider",
  "identifiers": {
    "tax_id": "RUC12345678",
    "national_id": null,
    "registration_number": "BC-2022-9001"
  },
  "contact": {
    "email": "info@bancocontinental.com",
    "phone": "+51 1 4444444",
    "address": "Av. Central 123, Lima"
  },
  "is_active": true
}
```

### 18.8 Resources Definition: Resources (Legal & Business Counterpart)

The **Resources** represents the labor force provided by employees (and other people in a non-dependent employment relatinship) that interacts financially or contractually with the Tenant and specifically with one of it's Business Entities. In GoDigital, this is a unified abstraction covering employees, externals and independent.

This generalization eliminates the need for multiple separate constructs (“employee”, “independent”, “external”, etc.) and consolidates them into a single, flexible structure.


### 18.8.1 Purpose in GoDigital

* Acts as the (Business Entity) **internal counterpart** for:
  * Expense Requests
  * Payments Requests
  * Bank Transaction Matching
  * Projects (client link)

* Supports classification and analytics
* Enables consistent normalization across transaction tiers

### 18.8.2 Key Subclass Dimensions

A Resource is defined by two major classification systems:


### 18.8.3 Key Subclass Dimensions

A Resource is defined by three major classification systems:


#### (1) **resource-class**  (what service role it plays)


Examples:

* employee
* independent
* external


#### (2) **legal-class**

Defines the legal nature:

* **legal-entity** (company, institution)
* **natural-entity** (individual, sole proprietor)

### 18.8.4 Resource Roles

A Resource, within the scope of a Business Entity, shall have specific assigned Roles.

#### (1) **resource-roles**  (what the Resource can do)

Examples:

* supervisor
* administration
* finance
* collaborator


```json
{
  "Role": {
    "name": "string",
    "permissions": ["string"]
  }
}
```

---

## 19. Attribute Extension for Entity: Owner Associate (Bidirectional Modeling)

### 19.1 Description

The model includes **two independent boolean attributes**, capturing two different realities:

1. **has-owner-associate (boolean):**
   Indicates that an entity **is represented by** one or more other entities.

2. **is-owner-associate (boolean):**
   Indicates that an entity **serves as a representative** for other entities.

These two flags must NOT be assumed to imply each other.

A represented entity (has‑owner‑associate = true) lists the authorized representatives.
A representative entity (is‑owner‑associate = true) lists the entities it is authorized to represent.

This allows modeling realistic 1‑to‑many and many‑to‑many representation structures.

---

### 19.2 Updated Schema Additions

```json
{
  "has_owner_associate": "boolean",        // default false
  "owner_associates": [                     // list of representatives (if has_owner_associate = true)
    {
      "entity_id": "string",
      "entity_name": "string"
    }
  ],

  "is_owner_associate": "boolean",         // default false
  "represents": [                           // list of represented entities (if is_owner_associate = true)
    {
      "entity_id": "string",
      "entity_name": "string"
    }
  ]
}
```

---

### 19.3 Interpretation of the Two Flags

#### **A. has-owner-associate = true**

Meaning:

> “This entity is represented by one or more other entities.”

Example scenarios:

* A company represented legally by a natural person.
* An SME represented by an external accountant.
* A sole proprietor represented by an administrative services company.
* A contractor represented by a lawyer.
* An individual represented by another individual.

The list `owner_associates[]` enumerates the authorized representatives.

#### **B. is-owner-associate = true**

Meaning:

> “This entity is authorized to represent one or more other entities.”

Example scenarios:

* An accountant representing multiple client companies.
* A lawyer representing several natural persons.
* A holding company acting on behalf of subsidiaries.

The list `represents[]` enumerates the entities it can represent.

---

### 19.4 Business Rules

1. **Flags are independent.**
   An entity may:

   * be represented (has-owner-associate = true)
   * represent others (is-owner-associate = true)
   * do both
   * do neither

2. **If has-owner-associate = true**, then `owner_associates[]` must contain ≥ 1 item.

3. **If is-owner-associate = true**, then `represents[]` must contain ≥ 1 item.

4. All relationships must occur within the same company.

5. Representation must be explicit; no automatic inference.

6. Circular representation is allowed only if both sides explicitly declare the relationship (rare use case).

7. Entities in either list must exist and be active.

8. Deleting an entity requires cleaning both lists wherever it appears.

---

### 19.5 Examples

#### Example A — Entity that **has** owner associates

```json
{
  "id": "ent-050",
  "company_id": "comp-01",
  "name": "Construcciones Rivera S.A.",
  "has_owner_associate": true,
  "owner_associates": [
    { "entity_id": "ent-901", "entity_name": "Juan Alberto Rivera" }
  ],
  "is_owner_associate": false,
  "represents": []
}
```

#### Example B — Entity that **is** an owner associate

```json
{
  "id": "ent-901",
  "company_id": "comp-01",
  "name": "Juan Alberto Rivera",
  "is_owner_associate": true,
  "represents": [
    { "entity_id": "ent-050", "entity_name": "Construcciones Rivera S.A." },
    { "entity_id": "ent-003", "entity_name": "Servicios Técnicos del Sur EIRL" }
  ],
  "has_owner_associate": false,
  "owner_associates": []
}
```

#### Example C — Entity that is *both* represented and a representative (rare but valid)

```json
{
  "id": "ent-777",
  "company_id": "comp-01",
  "name": "Grupo Legal Ramirez SAC",
  "has_owner_associate": true,
  "owner_associates": [
    { "entity_id": "ent-888", "entity_name": "Lic. Patricia Velarde" }
  ],
  "is_owner_associate": true,
  "represents": [
    { "entity_id": "ent-120", "entity_name": "Transporte Fénix S.A." }
  ]
}
```

---

### 19.6 Usage in GoDigital

* When matching expenses or transactions, the system checks both sides:

  * If the payer/beneficiary is represented by someone.
  * If the payer/beneficiary is representing someone else.
* Expense Requests can be filed “by representative X on behalf of entity Y.”
* Legal and financial audit trails include both identities.
* This model supports multi-client accountants, lawyers, and administrators.

---

This completes the modeling of **Owner Associate relationships** between Entities.

## 20. MongoDB Data Model (Option C – Mixed Strategy)

### 20.1 Design Principles

For GoDigital we use a **mixed modeling strategy**:

* **Embed** when the child object:

  * always belongs to a single parent,
  * is relatively small,
  * and is usually read/updated together with the parent.
* **Reference** when the child object:

  * is shared across parents,
  * has its own lifecycle,
  * or can grow large / independently.

All documents include:

* `company_id` for multi‑tenant isolation.
* `created_at`, `updated_at` timestamps.

IDs are modeled as strings (UUIDs) for clarity; in a real deployment they can be MongoDB `ObjectId` or UUIDs.

---

### 20.2 Collections Overview

1. `companies`
2. `resources`, `roles`
3. `business_units`
4. `service_offerings`
5. `business_entities`
6. `projects`
7. `expense_requests`
8. `payments`
9. `bank_accounts`
10. `bank_raw_transactions`
11. `bank_source_transactions`
12. `bank_partial_transactions`
13. `bank_full_transactions`
14. `exchange_rates`
15. `settings` (general configuration, enums, etc.)
16. `payment_requests`

---

### 20.3 Core Collections

#### 20.3.1 `companies`

Minimal representation of a tenant.

```json
{
  "_id": "string",
  "name": "string",
  "base_currency": "string",       // e.g. "PEN", "USD"
  "is_active": true,
  "created_at": "datetime",
  "updated_at": "datetime"
}
```

**Indexes:**

* `{ name: 1 }` (unique)

---

#### 20.3.2 `users`

```json
{
  "_id": "string",
  "company_id": "string",
  "name": "string",
  "email": "string",
  "role_id": "string",
  "is_active": true,
  "created_at": "datetime",
  "updated_at": "datetime"
}
```

**Indexes:**

* `{ company_id: 1, email: 1 }` (unique per company)

`roles` is a small collection with role name and permission list.

---

#### 20.3.3 `business_units`

Embed **areas** because they are small and belong only to the BU.

```json
{
  "_id": "string",
  "company_id": "string",
  "name": "string",                 // unique per company
  "description": "string",
  "areas": [
    { "id": "string", "name": "string", "description": "string|null" }
  ],
  "is_active": true,
  "created_at": "datetime",
  "updated_at": "datetime"
}
```

**Indexes:**

* `{ company_id: 1, name: 1 }` (unique)

---

#### 20.3.4 `service_offerings`

```json
{
  "_id": "string",
  "company_id": "string",
  "business_unit_id": "string",
  "name": "string",
  "description": "string",
  "features": ["string"],
  "expected_outcomes": ["string"],
  "is_active": true,
  "created_at": "datetime",
  "updated_at": "datetime"
}
```

**Indexes:**

* `{ company_id: 1, name: 1 }` (unique)
* `{ business_unit_id: 1 }`

---

#### 20.3.5 `entities`

Includes the **owner-associate** logic.

```json
{
  "_id": "string",
  "company_id": "string",
  "name": "string",
  "entity_classes": ["string"],        // vendor, investor, colaborator, customer, associate, contractor, etc.
  "legal_class": "legal-entity|natural-entity",
  "business_type": "string|null",        // banking, internet services provider, contractor, health care, etc.
  "vendor_type": "string|null",        // provider, supplier
  "identifiers": {
    "tax_id": "string|null",
    "national_id": "string|null",
    "registration_number": "string|null"
  },
  "contact": {
    "email": "string|null",
    "phone": "string|null",
    "address": "string|null"
  },
  "has_owner_associate": false,
  "owner_associates": [
    { "entity_id": "string", "entity_name": "string" }
  ],
  "is_owner_associate": false,
  "represents": [
    { "entity_id": "string", "entity_name": "string" }
  ],
  "is_active": true,
  "created_at": "datetime",
  "updated_at": "datetime"
}
```

**Indexes:**

* `{ company_id: 1, name: 1 }` (unique)
* `{ company_id: 1, entity_classes: 1 }`
* `{ company_id: 1, identifiers.tax_id: 1 }`

---

#### 20.3.6 `projects`

Embed **budgets** as subdocuments (budgets are tightly coupled to project).

```json
{
  "_id": "string",
  "company_id": "string",
  "name": "string",
  "type": "commercial|internal",
  "client_entity_id": "string|null",     // reference to entities._id
  "service_offering_id": "string|null",
  "business_unit_id": "string|null",
  "start_date": "date",
  "end_date": "date|null",
  "status": "planned|active|on_hold|closed",
  "budgets": [
    {
      "id": "string",
      "currency": "string",
      "allocated_amount": "number",
      "approved_by": "string",
      "approved_at": "datetime",
      "notes": "string|null",
      "is_active": true
    }
  ],
  "created_at": "datetime",
  "updated_at": "datetime"
}
```

**Indexes:**

* `{ company_id: 1, name: 1 }`
* `{ company_id: 1, status: 1 }`
* `{ company_id: 1, business_unit_id: 1 }`

---

#### 20.3.7 `expense_requests`

```json
{
  "_id": "string",
  "company_id": "string",
  "requester_id": "string",            // user
  "project_id": "string|null",
  "business_unit_id": "string|null",   // can be derived from project but optional explicit
  "beneficiary_entity_id": "string",   // entity receiving payment
  "currency": "string",
  "payable_amount": "number",
  "payable_amount_inc_igv": "boolean",
  "concept": "string",
  "category": "string",
  "status": "draft|submitted|approved|authorized|paid|closed|rejected|cancelled",
  "attachments": [
    { "id": "string", "name": "string", "url": "string" }
  ],
  "audit_log": [
    {
      "timestamp": "datetime",
      "user_id": "string",
      "action": "string",
      "details": "string"
    }
  ],
  "created_at": "datetime",
  "updated_at": "datetime"
}
```

**Indexes:**

* `{ company_id: 1, status: 1 }`
* `{ company_id: 1, project_id: 1 }`
* `{ company_id: 1, beneficiary_entity_id: 1 }`

---

#### 20.3.8 `payments`

Executed payments, normally linked 1–1 with an Expense Request or Payment Request and 1–1 with a RAW/SOURCE/PARTIAL transaction.

```json
{
  "_id": "string",
  "company_id": "string",
  "expense_request_id": "string",      // reference
  "bank_account_id": "string",
  "payment_date": "date",
  "currency": "string",
  "amount": "number",
  "bank_transaction_source_id": "string|null",  // bank_source_transactions._id
  "evidence": [
    { "id": "string", "name": "string", "url": "string" }
  ],
  "created_at": "datetime",
  "updated_at": "datetime"
}
```

**Indexes:**

* `{ company_id: 1, expense_request_id: 1 }`
* `{ company_id: 1, bank_account_id: 1, payment_date: 1 }`

#### Recurrence & Scheduling Fields

The data model must explicitly support recurrence as an independent dimension.

At minimum, the following fields must be introduced or confirmed:

```json
{
  "is_recurrent": true,
  "recurrence_rule_id": "string",
  "recurrence_schedule": {
    "frequency": "monthly | quarterly | yearly | custom",
    "expected_day": "number",
    "tolerance_days": "number",
    "next_expected_date": "date"
  }
}
```

Modeling constraints:

* `is_recurrent` MUST NOT be derived implicitly from other flags (e.g., `is_mass_payment`).
* Recurrence structures may exist:

  * even when no payment has yet occurred,
  * or when a scheduled payment is missed.
* Recurrence configuration is **owned by the system**, not the bank data.

These fields may appear in:

* recurring obligation entities,
* PARTIAL or FULL bank transaction records (as semantic enrichment),
* and planning / forecasting collections.

---

#### 20.3.9 `bank_accounts`

```json
{
  "_id": "string",
  "company_id": "string",
  "entity_id": "string",        // which bank (entities collection)
  "name": "string",             // internal label
  "bank_name": "string",        // snapshot
  "account_number": "string",
  "currency": "string",
  "is_active": true,
  "created_at": "datetime",
  "updated_at": "datetime"
}
```

**Indexes:**

* `{ company_id: 1, account_number: 1 }` (unique per company)


#### 20.3.10 `payment_requests`

```json
{
  "_id": "string",
  "company_id": "string",
  "requester_id": "string",            // user
  "project_id": "string|null",
  "business_unit_id": "string|null",   // can be derived from project but optional explicit
  "beneficiary_entity_id": "string",   // entity receiving payment
  "currency": "string",
  "payable_amount": "number",
  "payable_amount_inc_igv": "boolean",
  "concept": "string",
  "category": "string",
  "status": "draft|submitted|approved|authorized|paid|closed|rejected|cancelled",
  "attachments": [
    { "id": "string", "name": "string", "url": "string" }
  ],
  "audit_log": [
    {
      "timestamp": "datetime",
      "user_id": "string",
      "action": "string",
      "details": "string"
    }
  ],
  "created_at": "datetime",
  "updated_at": "datetime"
}
```

**Indexes:**

* `{ company_id: 1, status: 1 }`
* `{ company_id: 1, project_id: 1 }`
* `{ company_id: 1, beneficiary_entity_id: 1 }`

---

---

### 20.4 Transaction Pipeline Collections

Each tier is a separate collection for audit and reprocessing.

#### 20.4.1 `bank_raw_transactions`

Store the exact input as delivered by the bank.

```json
{
  "_id": "string",
  "source_id": "string|null",     // reference to import batch
  "company_id": "string",
  "bank_account_id": "string",

  "operation_date_time": "datetime",     // transaction date and time as reported by the bank
  "currency": "number",
  "amount": "number",
  
  "raw_payload": "object",             // original row/fields
  "imported_at": "datetime"
}
```

**Indexes:**

* `{ company_id: 1, bank_account_id: 1 }`

---

#### 20.4.2 `bank_source_transactions`

Normalized RAW with UUID-level identity.

```json
{
  "uuid": "string",                     // SOURCE transaction UUID.
  "raw_transaction_id": "string",     // link to bank_raw_transactions._id
  "company_id": "string",
  "bank_account_id": "string",

  "operation_date_time": "datetime",
  "norm_operation_date_time": "datetime",     // normalized date and time
					 
  "currency": "string",
  "norm_currency": "string",     // normalized currency
  "amount": "number",

  "description_raw": "string",
  "normalized_description": "string|null",
  "direction": "inflow|outflow",

  "status": "imported|processed",
  "created_at": "datetime",
  "updated_at": "datetime"
}
```

**Indexes:**

* `{ company_id: 1, bank_account_id: 1, operation_date: 1 }`
* `{ company_id: 1, raw_transaction_id: 1 }`

---

#### 20.4.3 `bank_partial_transactions`

> NOTE (REWRITE REQUIRED — DATA MODEL CORRECTION)
> The current `20.4.3 bank_partial_transactions` JSON snippet in v2.0 is duplicated/corrupted (structure repeats and is incomplete).
> This replacement aligns the PARTIAL stage with:
> - L1-A: mass payment flags + decomposition requirement
> - L1-B: recurrence flags + scheduling linkage
> - L1-C: calendarization engine linkage (calendar event references)

```json
{
  "_id": "string",

  "source_transaction_uuid": "string",         // bank_source_transactions.uuid
  "company_id": "string",
  "bank_account_id": "string",

  "operation_date_time": "datetime",
  "norm_operation_date_time": "datetime",

  "currency": "string",
  "norm_currency": "string",

  "amount": "number",
  "norm_amount": "number",

  "description": "string",
  "counterparty_name": "string|null",

  /* -----------------------------
     SEMANTIC CLASSIFICATION (PARTIAL)
     ----------------------------- */

  "semantic_operation_family": "string",       
  // e.g. "administrative_payment", "operational_payment", "transfer", "unknown"

  "semantic_operation_type": "string",
  // e.g. "mass_payment", "service_payment", "tax_payment", "utility_bundle", "internet", "rent", etc.

  "bank_label_raw": "string|null",             
  // original bank label/category if present (e.g., "pago de servicios")

  "classification_confidence": "number|null",  
  // optional (0..1) if classifier uses scoring; otherwise null

  "classification_rules_applied": [
    {
      "rule_id": "string",
      "rule_name": "string",
      "matched_on": ["string"],                 
      "notes": "string|null",
      "ts": "datetime"
    }
  ],

  /* -----------------------------
     MASS PAYMENT (L1-A)
     ----------------------------- */

  "is_mass_payment": "boolean",
  "requires_decomposition": "boolean",

  "decomposition_status": "string",
  // "not_required" | "required_pending" | "in_progress" | "completed" | "locked"

  "decomposition_template_id": "string|null",
  // optional reference to a reusable decomposition template (if you decide to support templates)

  "decomposition_expected_total": "number|null",
  // generally equals norm_amount when requires_decomposition=true

  /* -----------------------------
     RECURRENCE / SCHEDULING (L1-B)
     ----------------------------- */

  "is_recurring": "boolean",
  "recurrence_profile_id": "string|null",
  // links to recurrence_profiles (new collection proposed below)

  "expected_schedule_event_id": "string|null",
  // links to schedule_events (new collection proposed below)
  // used when this bank transaction is matched against an expected recurring obligation

  "schedule_match_status": "string|null",
  // "unmatched" | "matched" | "matched_with_deviation"
  // null if not applicable

  /* -----------------------------
     CALENDARIZATION (L1-C)
     ----------------------------- */

  "calendar_event_id": "string|null",
  // links to calendar_events (new collection proposed below)
  // used to show this transaction inside the calendar UI timeline

  /* -----------------------------
     INTERBANCARIA COMMISSION (ties to admin classification)
     ----------------------------- */

  "has_interbancaria_commission": "boolean",
  "commission_amount": "number|null",
  "commission_currency": "string|null",
  "commission_split_status": "string|null",
  // "not_applicable" | "pending" | "split_done"

  /* -----------------------------
     RECONCILIATION / REVIEW
     ----------------------------- */

  "reconciliation_status": "string",
  // "open" | "needs_review" | "reconciled" | "rejected"

  "review_notes": [
    {
      "note": "string",
      "author_user_id": "string",
      "ts": "datetime"
    }
  ],

  /* -----------------------------
     AUDIT
     ----------------------------- */

  "created_at": "datetime",
  "updated_at": "datetime"
}
```

When `requires_decomposition = true`, the PARTIAL transaction is not eligible for FULL promotion.

---

#### 20.4.4 `bank_full_transactions`

> NOTE (REWRITE REQUIRED — DATA MODEL CORRECTION)
> The former `20.4.4 bank_full_transactions` (v2.0) JSON snippet is truncated and uses "..." placeholders.
> This replacement (v2.1) aligns FULL stage storage with:
> - L1-A decomposition completion + locked allocations
> - L1-B recurrence linkage (profile + schedule event)
> - L1-C calendar event linkage and lifecycle tracking

```json
{
  "_id": "string",

  "partial_transaction_id": "string",          // bank_partial_transactions._id
  "source_transaction_uuid": "string",         // bank_source_transactions.uuid

  "company_id": "string",
  "bank_account_id": "string",

  "operation_date_time": "datetime",
  "norm_operation_date_time": "datetime",

  "currency": "string",
  "norm_currency": "string",

  "amount": "number",
  "norm_amount": "number",

  "description": "string",
  "counterparty_name": "string|null",

  /* -----------------------------
     FINAL SEMANTIC CLASSIFICATION
     ----------------------------- */

  "semantic_operation_family": "string",
  "semantic_operation_type": "string",

  "final_classification_locked": "boolean",
  "classification_locked_at": "datetime|null",
  "classification_locked_by": "string|null",

  /* -----------------------------
     MASS PAYMENT (L1-A) — FULL
     ----------------------------- */

  "is_mass_payment": "boolean",
  "requires_decomposition": "boolean",

  "decomposition_status": "string",
  // "not_required" | "completed" | "locked" | "reopened"

  "decomposition_id": "string|null",
  // links to mass_payment_decompositions (new collection proposed below)

  /* -----------------------------
     RECURRENCE / SCHEDULING (L1-B) — FULL
     ----------------------------- */

  "is_recurring": "boolean",
  "recurrence_profile_id": "string|null",
  "schedule_event_id": "string|null",
  "schedule_match_status": "string|null",

  /* -----------------------------
     CALENDARIZATION (L1-C) — FULL
     ----------------------------- */

  "calendar_event_id": "string|null",

  /* -----------------------------
     INTERBANCARIA COMMISSION — FULL
     ----------------------------- */

  "has_interbancaria_commission": "boolean",
  "commission": {
    "amount": "number|null",
    "currency": "string|null",
    "split_mode": "string|null",
    // "separate_transaction" | "embedded" | null
    "split_transaction_id": "string|null"
    // if commission split is materialized as another transaction record
  },

  /* -----------------------------
     ACCOUNTING / EXPORT HOOKS
     ----------------------------- */

  "accounting_posting_status": "string|null",
  // "not_posted" | "posted" | "error" | null if not used yet

  "accounting_posting_refs": [
    {
      "posting_id": "string",
      "system": "string",
      "ts": "datetime"
    }
  ],

  /* -----------------------------
     AUDIT
     ----------------------------- */

  "created_at": "datetime",
  "updated_at": "datetime"
}
```

**Indexes:**

* `{ company_id: 1, operation_date: 1 }`
* `{ company_id: 1, project_id: 1, operation_date: 1 }`
* `{ company_id: 1, business_unit_id: 1, operation_date: 1 }`

These indexes support dashboards for cashflow, projects, and BUs.

#### 20.4.5 `mass_payment_decompositions`

Parent object that stores the decomposition “payload” of a consolidated outflow.
This exists to support L1-A: post-payment decomposition, enforcement of totals, and locking.

```json
{
  "_id": "string",

  "company_id": "string",
  "bank_full_transaction_id": "string",          // bank_full_transactions._id

  "base_currency": "string",
  "base_total_amount": "number",

  "decomposition_method": "string",
  // "amounts" | "percentages"

  "status": "string",
  // "required_pending" | "in_progress" | "completed" | "locked" | "reopened"

  "items": [
    {
      "line_id": "string",

      "amount": "number",
      "percentage": "number|null",

      "business_unit_id": "string|null",
      "project_id": "string|null",
      "cost_center_id": "string|null",

      "beneficiary_entity_id": "string|null",
      // e.g., provider, SUNAT, employee, utility company (if modeled)

      "label": "string|null",
      "notes": "string|null"
    }
  ],

  "validation": {
    "computed_total_amount": "number",
    "computed_total_percentage": "number|null",
    "matches_base_total": "boolean",
    "last_validated_at": "datetime|null"
  },

  "locked_at": "datetime|null",
  "locked_by": "string|null",

  "created_at": "datetime",
  "updated_at": "datetime"
}
```

##### 🧬 20.4.5.1 — `bank_full_transactions` Behavior Clarification

##### FULL Transaction Generation Constraint — Mass Payments

A FULL Transaction MUST NOT be generated from a PARTIAL transaction where:

* `is_mass_payment = true`
* AND decomposition_items are missing or invalid.

Once decomposition is approved:

* each allocation item contributes to:
  * aggregated analytics,
  * project and BU reporting,
  * accounting export splits,
* while the FULL transaction retains traceability to:
  * the original SOURCE transaction,
  * the originating bank debit.

#### 20.4.6 `recurrence_profiles`

Defines recurring obligations and their “expected behavior”.
This supports L1-B (recurrence & scheduling) and L1-C (calendarization engine).

```json
{
  "_id": "string",

  "company_id": "string",

  "profile_name": "string",
  "profile_type": "string",
  // "administrative_payment" | "service_bundle" | "tax" | "rent" | "payroll_related" | "other"

  "enabled": "boolean",

  "recurrence_rule": {
    "frequency": "string",
    // "monthly" | "weekly" | "daily" | "custom"

    "interval": "number",
    // e.g., every 1 month

    "day_of_month": "number|null",
    // e.g., 5 = every month on the 5th

    "day_of_week": "string|null",
    // e.g., "MON"

    "timezone": "string|null"
  },

  "expected_amount": {
    "currency": "string",
    "amount": "number|null",
    "tolerance_pct": "number|null",
    "tolerance_abs": "number|null"
  },

  "expected_counterparty": {
    "name": "string|null",
    "entity_id": "string|null"
  },

  "classification_defaults": {
    "semantic_operation_family": "string|null",
    "semantic_operation_type": "string|null",
    "is_mass_payment_default": "boolean|null",
    "requires_decomposition_default": "boolean|null"
  },

  "calendarization": {
    "auto_generate_calendar_events": "boolean",
    "calendar_color_key": "string|null"
  },

  "created_at": "datetime",
  "updated_at": "datetime"
}
```

#### 20.4.7 `schedule_events`

Materialized expected occurrences derived from a recurrence_profile.
This supports matching bank transactions against “expected payments” (L1-B).

```json
{
  "_id": "string",

  "company_id": "string",
  "recurrence_profile_id": "string",          // recurrence_profiles._id

  "expected_date": "date",
  "expected_window": {
    "start": "datetime|null",
    "end": "datetime|null"
  },

  "expected_amount": {
    "currency": "string",
    "amount": "number|null"
  },

  "status": "string",
  // "expected" | "matched" | "missed" | "cancelled" | "rescheduled"

  "matched_bank_partial_id": "string|null",
  "matched_bank_full_id": "string|null",

  "deviation": {
    "date_delta_days": "number|null",
    "amount_delta": "number|null",
    "notes": "string|null"
  },

  "created_at": "datetime",
  "updated_at": "datetime"
}
```

#### 20.4.8 `calendar_events`

Calendar-facing events used by the “Google Calendar-like” UI layer (L1-C).
May represent:

* expected schedule events
* actual bank transactions
* or manually tracked administrative obligations

```json
{
  "_id": "string",

  "company_id": "string",

  "event_type": "string",
  // "expected_payment" | "actual_payment" | "manual_admin_obligation"

  "title": "string",
  "description": "string|null",

  "start": "datetime",
  "end": "datetime|null",
  "all_day": "boolean",

  "links": {
    "recurrence_profile_id": "string|null",
    "schedule_event_id": "string|null",
    "bank_partial_transaction_id": "string|null",
    "bank_full_transaction_id": "string|null"
  },

  "status": "string",
  // "planned" | "due" | "done" | "missed" | "cancelled"

  "ui": {
    "color_key": "string|null",
    "icon_key": "string|null"
  },

  "created_at": "datetime",
  "updated_at": "datetime"
}
```

---

### 20.5 `exchange_rates`

```json
{
  "_id": "string",
  "company_id": "string|null",   // null when global
  "base_currency": "string",
  "quote_currency": "string",
  "rate": "number",
  "date": "date",
  "created_at": "datetime"
}
```

**Indexes:**

* `{ base_currency: 1, quote_currency: 1, date: 1 }`

Used to compute `process_amount` in FULL transactions.

---

### 20.6 `settings`

A flexible collection for configuration and enumerations (categories, operation types, etc.).

```json
{
  "_id": "string",
  "company_id": "string",
  "key": "string",           // e.g. "expense_categories", "operation_types"
  "value": "object",         // arbitrary JSON structure
  "updated_at": "datetime"
}
```

**Indexes:**

* `{ company_id: 1, key: 1 }` (unique)

---

### 20.7 Access Patterns by Module

#### Bank Statement Processor

* **Write** to: `bank_raw_transactions`, `bank_source_transactions`.
* **Read/Write**: `bank_partial_transactions`, `bank_full_transactions`, `bank_accounts`, `exchange_rates`, `entities`.
* Typical operations:

  * Import RAW → create SOURCE.
  * Run matching rules → create/update PARTIAL.
  * Consolidate → create FULL.

#### Gestión del Egreso (Expense Workflow)

* **Main collections:** `expense_requests`, `payments`, `projects`, `entities`.
* Reads FULL/PARTIAL transactions for reconciliation.

#### Gestión de Proyectos (Project Accounting)

* **Main collections:** `projects`, `business_units`, `service_offerings`, `entities`, `bank_full_transactions`, `expense_requests`.
* Aggregations over `bank_full_transactions` by `project_id` and `business_unit_id` for profitability.

---

### 20.8 Design Notes

> ### MassPayment as a Logical Wrapper  
>
> A dedicated MassPayment object MAY be introduced in future iterations as a logical wrapper around a SOURCE/PARTIAL transaction.
> This is not mandatory in v1.8, as decomposition data can be embedded directly in PARTIAL transactions.

> ### Requiring Payment Conceptual Alignment
>
> Any interpretation that treats “recurring payments” as synonymous with
> “fixed payments” or “predefined payment requests” is deprecated.
>
> Recurrence is a **temporal semantic attribute**, not a workflow shortcut.
> Execution, approval, and payment classification remain governed by their
> respective domains.
>
>### NOTE — Recurrence Conceptual Alignment
>
>Recurrence is a **planning construct**, not an execution construct.
>
>The following semantic constraints are mandatory:
>
>- Recurrence ≠ Payment
>- Recurrence ≠ Bank Transaction
>- Recurrence ≠ Approval Shortcut
>- Recurrence ≠ Classification Override
>
>A recurrence defines *expected intent over time*, not financial reality.
>
>Consequences:
>- No payment is created solely because a recurrence exists.
>- No approval is skipped because a recurrence is defined.
>- No bank transaction is reclassified because it resembles a recurrence.
>- No accounting entry is generated without an observed financial event.
>
>This separation is intentional and foundational to GoDigital’s integrity.
>

