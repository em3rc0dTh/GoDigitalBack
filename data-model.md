# GoDigitalBack Data Model Documentation

This document provides a comprehensive list of all entities (collections) present in the GoDigitalBack database, divided into **System Models** (global platform data) and **Tenant Models** (tenant-specific/business data). It includes every parameter, its type, and connections (references) to other collections.

---

## 🏗 System Models (System DB)
These models are stored in the central system database and control the platform's configuration, tenants, users, and global routing.

### 1. `EmailForwardingConfig`
Configuration for email forwarding by entity/tenant to enrich raw emails.
- `_id`: ObjectId
- `entityId`: ObjectId (Ref `TenantDetail`)
- `forwardingData`: Array of Objects
  - `email`: String (Required, lowercase, trim)
  - `accounts`: ObjectId[] (Required)
- `active`: Boolean (Default: true)
- `createdAt`: Date
- `updatedAt`: Date

### 2. `FormSchema`
Dynamic form schemas used in the platform.
- `_id`: ObjectId
- `name`: String (Required, unique)
- `schema`: Mixed (JSON Object, Required)
- `uiSchema`: Mixed (JSON Object, Default: {})
- `description`: String
- `isActive`: Boolean (Default: true)
- `createdAt`: Date
- `updatedAt`: Date

### 3. `GmailWatch`
Tracking for active Gmail Push Notifications subscriptions.
- `_id`: ObjectId
- `tenantDetailId`: ObjectId (Ref `TenantDetail`, Required, unique)
- `email`: String (Required)
- `historyId`: String (Required)
- `expiration`: Date (Required)
- `topicName`: String (Required)
- `accessToken`: String (Required)
- `refreshToken`: String (Required)
- `status`: String (Enum: `active`, `expired`, `error`, Default: `active`)
- `lastError`: String (Default: null)
- `createdAt`: Date
- `updatedAt`: Date

### 4. `Member`
Links a user to a tenant with specific roles and permissions.
- `_id`: ObjectId
- `tenantId`: ObjectId (Ref `Tenant`, Required)
- `userId`: ObjectId (Ref `User`, Required)
- `role`: Mixed / String (Ref `Roles`, Required)
- `permissionsExtra`: Mixed / String[] (Ref `Permission`, Default: [])
- `status`: String (Enum: `active`, `invited`, `suspended`, Default: `active`)
- `invitedBy`: ObjectId (Ref `User`)
- `isStandard`: Boolean (Default: false)
- `resourceId`: ObjectId (Ref `Resource`, Default: null)
- `createdAt`: Date
- `updatedAt`: Date

### 5. `Permission`
System-wide permissions catalog.
- `_id`: ObjectId
- `name`: String (Required, unique)
- `description`: String (Default: null)
- `status`: String (Enum: `active`, `inactive`, Default: `active`)
- `createdAt`: Date
- `updatedAt`: Date

### 6. `Roles`
System-wide roles grouping permissions.
- `_id`: ObjectId
- `name`: String (Required, unique)
- `description`: String (Default: null)
- `permissions`: Mixed[] (Ref `Permission` by name, Default: [])
- `status`: String (Enum: `active`, `inactive`, Default: `active`)
- `createdAt`: Date
- `updatedAt`: Date

### 7. `SystemEmailRaw` (Collection: `Transaction_Raw_Gmail_System`)
Centralized raw email reception from Gmail before tenant routing.
- `_id`: ObjectId
- `gmailId`: String (Required, unique)
- `threadId`: String (Required)
- `historyId`: String (Required)
- `messageId`: String (Required)
- `from`: String (Required)
- `subject`: String (Required)
- `receivedAt`: Date (Required)
- `html`: String (Default: null)
- `textBody`: String (Default: null)
- `labels`: String[] (Default: [])
- `routing`: Object (Default: null)
  - `entityId`: ObjectId (Ref `TenantDetail`, Default: null)
  - `bank`: String (Default: null)
  - `accountNumber`: String (Default: null)
- `transactionVariables`: Object
  - `originAccount`: String (Default: null)
  - `destinationAccount`: String (Default: null)
  - `amount`: Number (Default: null)
  - `currency`: String (Default: null)
  - `operationDate`: Date (Default: null)
  - `operationNumber`: String (Default: null)
- `transactionType`: String (Default: null)
- `processed`: Boolean (Default: false)
- `processedAt`: Date (Default: null)
- `error`: String (Default: null)
- `createdAt`: Date
- `updatedAt`: Date

### 8. `SystemEntity`
Global entities (vendors, customers, investors, banks).
- `_id`: ObjectId (Required)
- `name`: String (Required)
- `entityClass`: String (Enum: `vendor`, `customer`, `investor`, Default: null)
- `legalClass`: String (Enum: `natural-entity`, `legal-entity`, Default: null)
- `businessType`: String (Default: null)
- `vendorType`: String (Default: null)
- `identifiers`: Object
  - `taxId`: String (Default: null)
  - `taxIdType`: String (Default: null)
  - `taxIdCountry`: String (Default: null)
- `contact`: Object
  - `email`: String (Default: null)
  - `phone`: String (Default: null)
  - `address`: String (Default: null)
- `ownerAssociates`: Array of Objects [{ `entityId`: String, `entityName`: String }]
- `isOwnerAssociate`: Boolean (Default: false)
- `represents`: Object { `entityId`: String, `entityName`: String } (Default: null)
- `isActive`: Boolean (Default: true)
- `createdAt`: Date
- `updatedAt`: Date

### 9. `Tenant`
Top-level Tenant/Client structure.
- `_id`: ObjectId
- `name`: String (Required)
- `ownerEmail`: String (Required)
- `dbList`: ObjectId[] (Ref `TenantDetail`)
- `metadata`: Mixed
- `createdAt`: Date
- `updatedAt`: Date

### 10. `TenantDetail`
Specific database definition and fiscal info for a Tenant.
- `_id`: ObjectId
- `tenantId`: ObjectId (Ref `Tenant`, Required)
- `dbName`: String (Required, unique)
- `country`: String (Required)
- `entityType`: String (Enum: `natural`, `legal`, Required)
- `taxId`: String (Required, unique)
- `businessEmail`: String (Default: null)
- `domain`: String (Default: null)
- `metadata`: Mixed (Default: {})
- `createdAt`: Date
- `updatedAt`: Date

### 11. `User`
Global platform users.
- `_id`: ObjectId
- `email`: String (Required, unique)
- `passwordHash`: String (Required)
- `name`: String (Required)
- `isActive`: Boolean (Default: true)
- `googleId`: String (Unique, sparse)
- `avatar`: String (Default: null)
- `status`: String (Enum: `active`, `invited`, `suspended`, Default: `active`)
- `role`: String (Default: `standard`)
- `emailVerified`: Boolean (Default: false)
- `emailVerificationToken`: String (Default: null)
- `resetPasswordToken`: String (Default: null)
- `resetPasswordExpires`: Date (Default: null)
- `createdAt`: Date
- `updatedAt`: Date

---

## 🏢 Tenant Models (Tenant DB)
These models are stored in each tenant's specific database (`dbName` defined in `TenantDetail`).

### 12. `Account` (Collection: `Bank_Account`)
Bank accounts managed by the tenant.
- `_id`: ObjectId
- `alias`: String
- `bank_name`: String (Required)
- `entity_id`: ObjectId (Ref `SystemEntity` in System DB, Default: null)
- `account_holder`: String (Required)
- `bank_account_type`: String (Required)
- `account_number`: String (Required)
- `business_unit`: ObjectId[] (Ref `BusinessUnit`)
- `currency`: String
- `account_type`: String
- `tx_count`: Number (Default: 0)
- `oldest`: Date (Default: null)
- `newest`: Date (Default: null)
- `assigned_bu`: ObjectId[] (Ref `BusinessUnit`)
- `createdAt`: Date
- `updatedAt`: Date

### 13. `BusinessUnit`
Business Units (Departments/Areas) within the tenant.
- `_id`: ObjectId
- `tenantDetailId`: ObjectId (Default: null)
- `name`: String (Required)
- `description`: String (Default: "")
- `areas`: Mixed[] (Default: [])
- `isActive`: Boolean (Default: true)
- `admin_id`: ObjectId (Ref `User` in System DB)
- `treasurers`: ObjectId[] (Ref `User` in System DB)
- `createdAt`: Date
- `updatedAt`: Date

### 14. `CashRequest`
Cash requests or expense reports created by employees.
- `_id`: ObjectId
- `created_by`: ObjectId (Ref `User` in System DB)
- `beneficiary_id`: ObjectId (Ref `User` in System DB)
- `project_id`: ObjectId (Ref `Project`, Required)
- `employee_name`: String
- `employee_email`: String
- `requested_amount`: Number (Required)
- `authorized_amount`: Number
- `expense_period_days`: Number (Default: 7)
- `currency`: String (Default: 'PEN')
- `purpose`: String (Required)
- `notes`: String
- `status`: String (Enum: `created`, `approved`, `authorized`, `paid`, `expense_draft`, `submitted`, `under_review`, `closed`, `rejected`, `reimbursement`, `refund`, Default: `created`)
- `approved_by`: ObjectId (Ref `User` in System DB)
- `approval_notes`: String
- `authorized_by`: ObjectId (Ref `User` in System DB)
- `authorization_notes`: String
- `expense_period_started_at`: Date
- `paid_by`: ObjectId (Ref `User` in System DB)
- `payment_proof`: String
- `payment_notes`: String
- `total_spent`: Number
- `expense_files`: String[] (Default: [])
- `expense_items`: Array of Objects
  - `file_id`: String
  - `date`: Date
  - `amount`: Number (Required)
  - `currency`: String
  - `issuer_name`: String
  - `tax_id`: String
  - `description`: String
  - `items`: Array of { `description`: String, `quantity`: Number, `unit`: String, `unitPrice`: Number, `total`: Number }
  - `ai_raw_data`: Mixed
- `submitted_at`: Date
- `reviewed_by`: ObjectId (Ref `User` in System DB)
- `balance`: Number
- `review_notes`: String
- `closed_by`: ObjectId (Ref `User` in System DB)
- `closure_proof`: String
- `closure_notes`: String
- `closed_at`: Date
- `rejected_by`: ObjectId (Ref `User` in System DB)
- `rejection_reason`: String
- `createdAt`: Date
- `updatedAt`: Date

### 15. `EmailLog`
Logs of emails processed for the tenant (specifically for transaction scraping).
- `_id`: ObjectId
- `accountId`: ObjectId (Ref `Account`, Optional)
- `messageId`: String (Required, unique)
- `threadId`: String
- `historyId`: String (Required)
- `from`: String (Required)
- `subject`: String (Default: "")
- `receivedDate`: Date (Required)
- `processed`: Boolean (Default: false)
- `processedAt`: Date
- `transactionsCreated`: Number (Default: 0)
- `rawBody`: String
- `attachments`: Array of { `filename`: String, `mimeType`: String, `size`: Number, `processed`: Boolean (Default: false) }
- `error`: String
- `createdAt`: Date
- `updatedAt`: Date

### 16. `Entity`
Providers, suppliers, or local actors interacting with the tenant.

**[PREVIOUS SCHEMA]**
- `_id`: ObjectId
- `company_id`: String (Required)
- `name`: String (Required)
- `entity_classes`: String[] (Default: [])
- `legal_class`: String (Enum: `legal-entity`, `natural-entity`, Required)
- `business_type`: String
- `vendor_type`: String (Enum: `provider`, `supplier`, `vendor`)
- `identifiers`: Object
  - `tax_id`: String
  - `national_id`: String
  - `registration_number`: String
- `contact`: Object
  - `email`: String
  - `phone`: String
  - `address`: String
- `has_owner_associate`: Boolean (Default: false)
- `owner_associates`: Array of { `entity_id`: String, `entity_name`: String }
- `is_owner_associate`: Boolean (Default: false)
- `represents`: Array of { `entity_id`: String, `entity_name`: String }
- `is_active`: Boolean (Default: true)
- `createdAt`: Date
- `updatedAt`: Date

**[NEW SCHEMA UPDATE]**
- `_id`: ObjectId
- `company_id`: String (Required)
- `name`: String (Required)
- `entity_classes`: String[] (Default: [])
- `legal_class`: String (Enum: `legal-entity`, `natural-entity`, Required)
- `business_type`: String
- `vendor_type`: String (Enum: `provider`, `supplier`, `vendor`)
- `identifiers`: Object { `tax_id`: String, `national_id`: String, `registration_number`: String }
- `contact`: Object { `email`: String, `phone`: String, `address`: String }
- `has_owner_associate`: Boolean (Default: false)
- `owner_associates`: Array of { `entity_id`: String, `entity_name`: String }
- `is_owner_associate`: Boolean (Default: false)
- `represents`: Array of { `entity_id`: String, `entity_name`: String }
- **`bank_accounts`: Array of Objects [NEW]**
  - `_id`: ObjectId
  - `alias`: String
  - `bank_name`: String (Required)
  - `currency`: String (Required)
  - `account_number`: String (Required)
  - `cci_number`: String
  - `is_official`: Boolean (Default: true)
  - `third_party_owner`: Object (Required if `is_official` = false)
    - `name`: String
    - `tax_id`: String
  - `is_active`: Boolean (Default: true)
- `is_active`: Boolean (Default: true)
- `createdAt`: Date
- `updatedAt`: Date

### 17. `PaymentRequest`
Requests for paying providers or vendors.

**[PREVIOUS SCHEMA]**
- `_id`: ObjectId
- `created_by`: ObjectId (Ref `User` in System DB)
- `purchase_order_id`: ObjectId (Ref `PurchaseOrder`)
- `voucher_id`: ObjectId (Ref `Voucher`)
- `provider_id`: ObjectId (Ref `Entity`, Required)
- `project_id`: ObjectId (Ref `Project`, Required)
- `subtotal`: Number (Required)
- `tax`: Number (Required)
- `total`: Number (Required)
- `currency`: String (Default: `USD`)
- `date`: Date
- `dueDate`: Date
- `status`: String (Enum: `pending`, `approved`, `authorized`, `paid`, `rejected`, Default: `pending`)
- `approved_by`: ObjectId (Ref `User` in System DB)
- `authorized_by`: ObjectId (Ref `User` in System DB)
- `rejected_by`: ObjectId (Ref `User` in System DB)
- `paid_by`: ObjectId (Ref `User` in System DB)
- `payment_proof`: String
- `notes`: String
- `attachments`: String[] (Default: [])
- `debited_bank_account`: ObjectId (Ref `Bank_Account` / `Account`)
- `payment_date`: Date
- `approval_notes`: String
- `authorization_notes`: String
- `payment_notes`: String
- `rejection_reason`: String
- `createdAt`: Date
- `updatedAt`: Date

**[NEW SCHEMA UPDATE]**
- `_id`: ObjectId
- `created_by`: ObjectId (Ref `User` in System DB)
- `purchase_order_id`: ObjectId (Ref `PurchaseOrder`)
- `voucher_id`: ObjectId (Ref `Voucher`)
- `provider_id`: ObjectId (Ref `Entity`, Required)
- **`provider_bank_account_id`: ObjectId (Ref `Entity.bank_accounts._id`) [NEW]**
- **`provider_bank_account_snapshot`: Mixed (Snapshot of selected account details) [NEW]**
- `project_id`: ObjectId (Ref `Project`, Required)
- `subtotal`: Number (Required)
- `tax`: Number (Required)
- `total`: Number (Required)
- `currency`: String (Default: `USD`)
- `date`: Date
- `dueDate`: Date
- `status`: String (Enum: `pending`, `approved`, `authorized`, `paid`, `rejected`, Default: `pending`)
- `approved_by`: ObjectId (Ref `User` in System DB)
- `authorized_by`: ObjectId (Ref `User` in System DB)
- `rejected_by`: ObjectId (Ref `User` in System DB)
- `paid_by`: ObjectId (Ref `User` in System DB)
- `payment_proof`: String
- `notes`: String
- `attachments`: String[] (Default: [])
- `debited_bank_account`: ObjectId (Ref `Bank_Account` / `Account`)
- `payment_date`: Date
- `approval_notes`: String
- `authorization_notes`: String
- `payment_notes`: String
- `rejection_reason`: String
- `createdAt`: Date
- `updatedAt`: Date

### 18. `Project`
Projects handled by the tenant, mapping budgets.
- `_id`: ObjectId
- `name`: String (Required)
- `code`: String
- `description`: String
- `projectOwner`: ObjectId (Ref `User` in System DB)
- `business_unit_id`: ObjectId (Ref `BusinessUnit`)
- `status`: String (Enum: `active`, `completed`, `on_hold`, `cancelled`, `planned`, Default: `active`)
- `startDate`: Date
- `endDate`: Date
- `isActive`: Boolean (Default: true)
- `budgets`: Array of Objects
  - `id`: String
  - `currency`: String
  - `allocated_amount`: Number
  - `approved_by`: String
  - `approved_at`: Date
  - `notes`: String
  - `is_active`: Boolean (Default: true)
- `createdAt`: Date
- `updatedAt`: Date

### 19. `PurchaseOrder`
Purchase orders issued by the tenant.
- `_id`: ObjectId
- `poNumber`: String (Unique)
- `created_by`: ObjectId (Ref `User` in System DB)
- `provider_id`: ObjectId (Ref `Entity`, Required)
- `project_id`: ObjectId (Ref `Project`)
- `business_unit_id`: ObjectId (Ref `BusinessUnit`)
- `items`: Array of Objects (Default: [])
  - `description`: String (Required)
  - `quantity`: Number (Required, Default: 1)
  - `unitPrice`: Number (Required, Default: 0)
  - `total`: Number (Required, Default: 0)
- `totalAmount`: Number (Required, Default: 0)
- `currency`: String (Default: `USD`)
- `status`: String (Enum: `draft`, `issued`, `approved`, `rejected`, `completed`, `cancelled`, Default: `draft`)
- `issueDate`: Date (Default: Date.now)
- `expectedDeliveryDate`: Date
- `createdAt`: Date
- `updatedAt`: Date

### 20. `ReceiptInventory`
Storage of all receipts and invoices uploaded.
- `_id`: ObjectId
- `user_id`: ObjectId (Ref `User` in System DB, Required)
- `user_name`: String (Required)
- `source`: String (Required, e.g. 'cash_request')
- `source_id`: ObjectId
- `type`: String (Required, e.g. 'invoice', 'voucher')
- `period`: String (Required)
- `fileName`: String (Required)
- `filePath`: String (Required)
- `mimeType`: String (Required)
- `size`: Number (Required)
- `base64Url`: String
- `extracted_data`: Mixed (Parsed info from external APIs like n8n)
- `ai_raw_data`: Mixed
- `status`: String (Enum: `pending`, `processed`, `failed`, Default: `pending`)
- `createdAt`: Date
- `updatedAt`: Date

### 21. `Resource`
Local users/resources that interact in the tenant environment.
- `_id`: ObjectId
- `tenantDetailId`: ObjectId (Default: null)
- `userId`: ObjectId (Ref `User` in System DB, Required)
- `resourceRole`: String (Ref `ResourceRole.name`, Required)
- `relevantMetadata`: Mixed (Default: {})
- `createdAt`: Date
- `updatedAt`: Date

### 22. `ResourceRole` & `ResourcePermission`
Roles applied locally within the tenant for Resources.
- **ResourcePermission** (No `_id` creation by default):
  - `name`: String (Required, unique)
  - `description`: String
  - `status`: String (Default: `active`)
- **ResourceRole**:
  - `_id`: ObjectId
  - `name`: String (Required, unique)
  - `description`: String
  - `permissions`: String[] (Array of Permission names)
  - `status`: String (Default: `active`)

### 23. `TenantFile`
Files specifically belonging to the tenant settings or core configs.
- `_id`: ObjectId
- `fileName`: String (Required)
- `mimeType`: String (Required)
- `size`: Number (Required)
- `base64Url`: String
- `createdAt`: Date
- `updatedAt`: Date

### 24. `TenantInformation`
Core business data for the tenant.
- `_id`: ObjectId
- `tenantDetailId`: ObjectId (Ref `TenantDetail` in System DB)
- `legalName`: String (Required)
- `legalClass`: String (Required)
- `taxId`: String (Required)
- `baseCurrency`: String (Default: null)
- `contact`: Object (No `_id`, Default: null)
  - `name`: String
  - `email`: String
  - `phone`: String
- `createdAt`: Date
- `updatedAt`: Date

### 25. `Transaction` (Dynamic Collections: `Transaction_Raw_Web_<accountNumber>`)
Parsed web scraper transactions.
- `_id`: ObjectId
- `accountId`: ObjectId (Ref `Account`, Required)
- `uuid`: String (Sparse index)
- `descripcion`: String (Default: "")
- `fecha_hora`: Date
- `fecha_hora_raw`: String
- `monto`: Number
- `currency`: String
- `currency_raw`: String
- `operation_date`: String
- `process_date`: String
- `operation_number`: String
- `movement`: String
- `channel`: String
- `amount`: Number
- `balance`: Number
- `metadata`: Mixed (Default: {})
- `processed`: Boolean (Default: false)
- `processedAt`: Date (Default: null)
- `createdAt`: Date
- `updatedAt`: Date

### 26. `TransactionRaw` (Master RECO - Collection: `Transaction_Raw`)
Centralized Master collection unifying transactions from all sources for reconciliation.
- `_id`: ObjectId
- `source`: String (Enum: `GMAIL`, `PDF`, `WEB`, `API`, `Statement`, `IMAP`, Default: `GMAIL`, Required)
- `externalId`: String (Default: null)
- `gmailId`: String
- `threadId`: String
- `historyId`: String
- `messageId`: String
- `from`: String
- `subject`: String
- `receivedAt`: Date (Required)
- `html`: String (Default: null)
- `textBody`: String (Default: null)
- `labels`: String[] (Default: [])
- `routing`: Object (Default: null)
  - `entityId`: ObjectId (Ref `TenantDetail` in System DB, Default: null)
  - `bank`: String (Default: null)
  - `accountNumber`: String (Default: null)
- `transactionVariables`: Object
  - `originAccount`: String
  - `destinationAccount`: String
  - `amount`: Number
  - `currency`: String
  - `operationDate`: Date
  - `operationNumber`: String
- `transactionType`: String (Default: null)
- `linkedSources`: Array of Objects
  - `source`: String (Required)
  - `sourceId`: ObjectId (Required)
  - `externalId`: String (Default: null)
  - `rawData`: Mixed (Default: {})
  - `extractedAt`: Date (Default: Date.now)
- `systemRawId`: ObjectId (Ref `Transaction_Raw_Gmail_System`, Default: null)
- `imapRawId`: ObjectId (Ref `Transaction_Raw_IMAP`, Default: null)
- `webRawId`: ObjectId (Ref `TransactionRawAccountWeb`, Default: null)
- `matchStatus`: Boolean (Default: false)
- `matchAt`: Date (Default: null)
- `processed`: Boolean (Default: false)
- `processedAt`: Date (Default: null)
- `error`: String (Default: null)
- `deduplicationHash`: String (Unique, Sparse)
- `createdAt`: Date
- `updatedAt`: Date

### 27. `TransactionRawAccountWeb`
Dedicated transaction data parsed specifically from Web channels. Similar to Transaction schema but without dynamic naming.
- `_id`: ObjectId
- `accountId`: ObjectId (Ref `Account`, Required)
- `uuid`: String (Default: null)
- `descripcion`: String (Default: "")
- `fecha_hora`: Date (Default: null)
- `fecha_hora_raw`: String (Default: "")
- `monto`: Number (Default: 0)
- `currency`: String (Default: "")
- `currency_raw`: String (Default: "")
- `operation_date`: String (Default: "")
- `process_date`: String (Default: "")
- `operation_number`: String (Default: "")
- `movement`: String (Default: "")
- `channel`: String (Default: "")
- `amount`: Number (Default: 0)
- `balance`: Number (Default: 0)
- `metadata`: Mixed (Default: {})
- `createdAt`: Date
- `updatedAt`: Date

### 28. `TransactionRawGmail`
Minimal schema for initial raw ingestion of Gmail payloads.
- `_id`: ObjectId
- `gmailMessageId`: String (Required)
- `threadId`: String
- `from`: String
- `to`: String
- `subject`: String
- `date`: Date
- `bodyText`: String
- `bodyHtml`: String
- `attachments`: Array of { `filename`: String, `mimeType`: String, `attachmentId`: String, `size`: Number }
- `parsed`: Boolean (Default: false)
- `createdAt`: Date
- `updatedAt`: Date

### 29. `TransactionRawIMAP`
Transactions extracted via direct IMAP pull.
- `uid`: Number (Required)
- `message_id`: String (Required)
- `from`: String (Required)
- `subject`: String (Required)
- `date`: Date (Required)
- `html_body`: String (Default: null)
- `text_body`: String (Default: null)
- `pdfs`: Mixed[] (Default: [])
- `fetched_at`: Date (Required)
- `source`: String (Required)
- `processed`: Boolean (Default: false)
- `processedAt`: Date (Default: null)
- *(No automatic timestamps natively configured)*

### 30. `TransactionRawPDF` / `Transaction_Raw_C_PDF`
Parsed transactions extracted from PDFs.
- `_id`: ObjectId
- `fileName`: String (Required)
- `fileId`: String (Required)
- `localFilePath`: String (Default: null)
- `fecha_hora`: Date (Default: null)
- `fecha_hora_raw`: String (Default: "")
- `monto`: Number (Default: 0)
- `currency`: String (Default: "")
- `currency_raw`: String (Default: "")
- `operation_date`: String (Default: "")
- `process_date`: String (Default: "")
- `operation_number`: String (Default: "")
- `movement`: String (Default: "")
- `channel`: String (Default: "")
- `amount`: Number (Default: 0)
- `balance`: Number (Default: 0)
- `routing`: Object (Same as Master)
- `transactionVariables`: Object (Same as Master)
- `masterId`: ObjectId (Ref `Transaction_Raw`, Default: null)
- `processed`: Boolean (Default: false)
- `processedAt`: Date (Default: null)
- `error`: String (Default: null)
- `createdAt`: Date
- `updatedAt`: Date

### 31. `TransactionRawProcessed`
Secondary parsed results containing AI extraction confidence mapping.
- `_id`: ObjectId
- `rawGmailId`: ObjectId (Ref `Transaction_Raw_Gmail`, Required)
- `amount`: Number
- `currency`: String
- `date`: Date
- `description`: String
- `bank`: String
- `accountHint`: String
- `confidence`: Number (Min: 0, Max: 1)
- `createdAt`: Date
- `updatedAt`: Date

### 32. `Transaction_Raw_C_Gmail`
Extracted Gmail data bound to the tenant layer (mirrors SystemEmailRaw but connects to Master RECO).
- `_id`: ObjectId
- `gmailId`: String (Required)
- `threadId`: String (Required)
- `historyId`: String (Required)
- `messageId`: String (Required)
- `from`: String (Required)
- `subject`: String (Required)
- `receivedAt`: Date (Required)
- `html`: String (Default: null)
- `textBody`: String (Default: null)
- `labels`: String[] (Default: [])
- `routing`: Object (Same as Master)
- `transactionVariables`: Object (Same as Master)
- `transactionType`: String (Default: null)
- `systemRawId`: ObjectId (Ref `Transaction_Raw_Gmail_System`, Default: null)
- `imapRawId`: ObjectId (Ref `Transaction_Raw_IMAP`, Default: null)
- `webRawId`: ObjectId (Ref `Transaction_Raw_C_Web`, Default: null)
- `masterId`: ObjectId (Ref `Transaction_Raw`, Default: null)
- `matchStatus`: Boolean (Default: false)
- `matchAt`: Date (Default: null)
- `processed`: Boolean (Default: false)
- `processedAt`: Date (Default: null)
- `error`: String (Default: null)
- `createdAt`: Date
- `updatedAt`: Date

### 33. `Transaction_Raw_C_Web`
Scraped Web banking data specifically tailored to map with the Master RECO.
- `_id`: ObjectId
- `accountId`: ObjectId (Ref `Account`, Required)
- `uuid`: String (Default: null)
- `descripcion`: String (Default: "")
- `fecha_hora`: Date (Default: null)
- `fecha_hora_raw`: String (Default: "")
- `monto`: Number (Default: 0)
- `currency`: String (Default: "")
- `currency_raw`: String (Default: "")
- `operation_date`: String (Default: "")
- `process_date`: String (Default: "")
- `operation_number`: String (Default: "")
- `movement`: String (Default: "")
- `channel`: String (Default: "")
- `amount`: Number (Default: 0)
- `balance`: Number (Default: 0)
- `metadata`: Mixed (Default: {})
- `masterId`: ObjectId (Ref `Transaction_Raw`, Default: null)
- `createdAt`: Date
- `updatedAt`: Date
