/*
  Flyway V1 - SmartBasket demonstration schema.

  Ten application tables + two compatibility views (TabStocksaico,
  TabStockBarCodesaico) required by the current runtime queries, with their
  constraints, indexes and the SB_ProductMetadata UpdatedAt trigger.

  No USE statement and no database-name guard, because Flyway runs every
  migration in the database named in its connection URL and records it in
  dbo.flyway_schema_history.

  Does NOT create: SB_Families, SB_Subfamilies, SB_Brands,
  SB_ProductInterpretationOverrides, SB_ProductInterpretationAudit,
  SB_EvaluationGroundTruth, or any WEB_* table. Never references another
  database.
*/

SET NOCOUNT ON;
SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;
SET XACT_ABORT ON;
GO

/* ---------- SB_Products ---------- */
IF OBJECT_ID(N'dbo.SB_Products', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.SB_Products (
    ProductId UNIQUEIDENTIFIER NOT NULL,
    ProductCode VARCHAR(20) NOT NULL,
    ProductName NVARCHAR(255) NOT NULL,
    Description NVARCHAR(1000) NULL,
    FamilyCode VARCHAR(30) NULL,
    FamilyName NVARCHAR(255) NULL,
    SubfamilyCode VARCHAR(10) NULL,
    SubfamilyName NVARCHAR(100) NULL,
    Brand NVARCHAR(255) NULL,
    Price DECIMAL(18, 3) NULL,
    Quantity DECIMAL(18, 3) NULL,
    IsActive BIT NOT NULL
      CONSTRAINT DF_SB_Products_IsActive DEFAULT (1),
    SourceUpdatedAt DATETIME2 NULL,
    ImportedAt DATETIME2 NOT NULL
      CONSTRAINT DF_SB_Products_ImportedAt DEFAULT (SYSUTCDATETIME()),
    CONSTRAINT PK_SB_Products PRIMARY KEY CLUSTERED (ProductId),
    CONSTRAINT CK_SB_Products_Price CHECK (Price IS NULL OR Price >= 0)
  );

  CREATE INDEX IX_SB_Products_Name
    ON dbo.SB_Products (ProductName);

  CREATE INDEX IX_SB_Products_Family
    ON dbo.SB_Products (FamilyCode, SubfamilyCode)
    WHERE IsActive = 1;

  CREATE INDEX IX_SB_Products_Brand
    ON dbo.SB_Products (Brand)
    WHERE IsActive = 1 AND Brand IS NOT NULL;
END;
GO

/* ---------- SB_ProductBarcodes ---------- */
IF OBJECT_ID(N'dbo.SB_ProductBarcodes', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.SB_ProductBarcodes (
    Barcode VARCHAR(80) NOT NULL,
    ProductId UNIQUEIDENTIFIER NOT NULL,
    ProductCode VARCHAR(20) NOT NULL,
    SourceBarcodeId INT NULL,
    Note NVARCHAR(255) NULL,
    ImportedAt DATETIME2 NOT NULL
      CONSTRAINT DF_SB_ProductBarcodes_ImportedAt DEFAULT (SYSUTCDATETIME()),
    CONSTRAINT PK_SB_ProductBarcodes PRIMARY KEY CLUSTERED (Barcode),
    CONSTRAINT FK_SB_ProductBarcodes_Product
      FOREIGN KEY (ProductId) REFERENCES dbo.SB_Products (ProductId)
      ON DELETE CASCADE
  );

  CREATE INDEX IX_SB_ProductBarcodes_ProductId
    ON dbo.SB_ProductBarcodes (ProductId);
END;
GO

/* ---------- Compatibility views (runtime contract) ---------- */
CREATE OR ALTER VIEW dbo.TabStocksaico
AS
  SELECT
    p.ProductId AS IDArt,
    p.ProductCode AS CodArt,
    p.ProductName AS LibArt,
    p.FamilyCode AS CodFam,
    p.FamilyName AS LibFam,
    p.SubfamilyCode AS CodSFam,
    p.SubfamilyName AS DesSFam,
    CAST(NULL AS FLOAT) AS Remise,
    CAST(p.Price AS FLOAT) AS PrixSite,
    CAST(NULL AS NVARCHAR(1000)) AS ExLibArtWeb,
    p.Description AS ExLibArt,
    CAST(NULL AS NVARCHAR(2000)) AS UrlImage,
    CAST(NULL AS NVARCHAR(2000)) AS UrlNormal,
    CAST(NULL AS NVARCHAR(2000)) AS UrlPromo,
    CAST(p.Quantity AS FLOAT) AS Qte,
    CAST(NULL AS VARBINARY(MAX)) AS imgArt,
    p.Brand AS Marque,
    CAST(CASE WHEN p.IsActive = 1 THEN 0 ELSE 1 END AS BIT) AS Archived,
    CAST(0 AS BIT) AS Blockage,
    CAST(1 AS BIT) AS Site
  FROM dbo.SB_Products p;
GO

CREATE OR ALTER VIEW dbo.TabStockBarCodesaico
AS
  SELECT
    b.ProductId AS IDArt,
    b.ProductCode AS CodArt,
    b.Barcode AS CodBar,
    b.Note AS Remarq
  FROM dbo.SB_ProductBarcodes b;
GO

/* ---------- SB_ProductMetadata (018 + 032 columns) ---------- */
IF OBJECT_ID(N'dbo.SB_ProductMetadata', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.SB_ProductMetadata (
    ProductId               UNIQUEIDENTIFIER NOT NULL,
    DisplayName             NVARCHAR(255) NULL,
    DisplayCategory         NVARCHAR(100) NULL,
    DisplaySubcategory      NVARCHAR(100) NULL,
    IntelligenceType        NVARCHAR(30)  NOT NULL
      CONSTRAINT DF_SB_ProductMetadata_IntelligenceType DEFAULT (N'none'),
    IsVisible               BIT NOT NULL
      CONSTRAINT DF_SB_ProductMetadata_IsVisible DEFAULT (1),
    IsFeatured              BIT NOT NULL
      CONSTRAINT DF_SB_ProductMetadata_IsFeatured DEFAULT (0),
    IsRecipeEligible        BIT NOT NULL
      CONSTRAINT DF_SB_ProductMetadata_IsRecipeEligible DEFAULT (0),
    IsReplenishmentEligible BIT NOT NULL
      CONSTRAINT DF_SB_ProductMetadata_IsReplenishmentEligible DEFAULT (0),
    ExpectedRepurchaseDays  INT NULL,
    ImagePath               NVARCHAR(500) NULL,
    SortOrder               INT NOT NULL
      CONSTRAINT DF_SB_ProductMetadata_SortOrder DEFAULT (0),
    CreatedAt               DATETIME2 NOT NULL
      CONSTRAINT DF_SB_ProductMetadata_CreatedAt DEFAULT (SYSUTCDATETIME()),
    UpdatedAt               DATETIME2 NOT NULL
      CONSTRAINT DF_SB_ProductMetadata_UpdatedAt DEFAULT (SYSUTCDATETIME()),
    CleanDisplayNameFr      NVARCHAR(255) NULL,
    CanonicalType           NVARCHAR(60) NULL,
    PackageAmount           DECIMAL(12, 3) NULL,
    PackageUnit             NVARCHAR(10) NULL,
    CurationVersion         INT NULL,
    CuratedAt               DATETIME2 NULL,

    CONSTRAINT PK_SB_ProductMetadata PRIMARY KEY CLUSTERED (ProductId),
    CONSTRAINT FK_SB_ProductMetadata_Product
      FOREIGN KEY (ProductId) REFERENCES dbo.SB_Products (ProductId)
      ON DELETE CASCADE,
    CONSTRAINT CK_SB_ProductMetadata_IntelligenceType
      CHECK (IntelligenceType IN (N'recipe', N'replenishment', N'none')),
    CONSTRAINT CK_SB_ProductMetadata_ExpectedRepurchaseDays
      CHECK (ExpectedRepurchaseDays IS NULL
             OR (ExpectedRepurchaseDays >= 1 AND ExpectedRepurchaseDays <= 3650)),
    CONSTRAINT CK_SB_ProductMetadata_RecipeEligibility
      CHECK (IsRecipeEligible = 0 OR IntelligenceType = N'recipe'),
    CONSTRAINT CK_SB_ProductMetadata_ReplenishmentEligibility
      CHECK (IsReplenishmentEligible = 0 OR IntelligenceType = N'replenishment'),
    CONSTRAINT CK_SB_ProductMetadata_SingleIntelligence
      CHECK (NOT (IsRecipeEligible = 1 AND IsReplenishmentEligible = 1)),
    CONSTRAINT CK_SB_ProductMetadata_PackageUnit
      CHECK (PackageUnit IS NULL OR PackageUnit IN (N'piece', N'g', N'ml')),
    CONSTRAINT CK_SB_ProductMetadata_PackageAmount
      CHECK (PackageAmount IS NULL OR PackageAmount > 0),
    CONSTRAINT CK_SB_ProductMetadata_PackagePair
      CHECK (
        (PackageAmount IS NULL AND PackageUnit IS NULL)
        OR (PackageAmount IS NOT NULL AND PackageUnit IS NOT NULL)
      ),
    CONSTRAINT CK_SB_ProductMetadata_CanonicalTypeShape
      CHECK (
        CanonicalType IS NULL
        OR (LEN(CanonicalType) BETWEEN 2 AND 60
            AND CanonicalType = LOWER(CanonicalType)
            AND CanonicalType NOT LIKE N'%[^a-z0-9_]%')
      ),
    CONSTRAINT CK_SB_ProductMetadata_CurationVersion
      CHECK (CurationVersion IS NULL OR CurationVersion >= 1),
    CONSTRAINT CK_SB_ProductMetadata_NonFoodNotRecipe
      CHECK (NOT (CanonicalType = N'non_food' AND IsRecipeEligible = 1))
  );

  CREATE INDEX IX_SB_ProductMetadata_Visible_Category
    ON dbo.SB_ProductMetadata (DisplayCategory, DisplaySubcategory, SortOrder)
    WHERE IsVisible = 1;

  CREATE INDEX IX_SB_ProductMetadata_Featured
    ON dbo.SB_ProductMetadata (SortOrder)
    WHERE IsFeatured = 1 AND IsVisible = 1;

  CREATE INDEX IX_SB_ProductMetadata_IntelligenceType
    ON dbo.SB_ProductMetadata (IntelligenceType)
    WHERE IntelligenceType <> N'none';

  CREATE INDEX IX_SB_ProductMetadata_Curated
    ON dbo.SB_ProductMetadata (CurationVersion, DisplayCategory)
    WHERE CurationVersion IS NOT NULL;
END;
GO

IF OBJECT_ID(N'dbo.TR_SB_ProductMetadata_SetUpdatedAt', N'TR') IS NULL
  AND OBJECT_ID(N'dbo.SB_ProductMetadata', N'U') IS NOT NULL
BEGIN
  EXEC(N'
    CREATE TRIGGER dbo.TR_SB_ProductMetadata_SetUpdatedAt
    ON dbo.SB_ProductMetadata
    AFTER UPDATE
    AS
    BEGIN
      SET NOCOUNT ON;
      UPDATE m
        SET UpdatedAt = SYSUTCDATETIME()
      FROM dbo.SB_ProductMetadata AS m
      INNER JOIN inserted AS i ON i.ProductId = m.ProductId;
    END;
  ');
END;
GO

/* ---------- SB_AppConfig ---------- */
IF OBJECT_ID(N'dbo.SB_AppConfig', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.SB_AppConfig (
    ConfigKey    NVARCHAR(100)  NOT NULL,
    ConfigValue  NVARCHAR(400)  NOT NULL,
    ValueType    NVARCHAR(20)   NOT NULL
      CONSTRAINT DF_SB_AppConfig_ValueType DEFAULT (N'int'),
    MinValue     INT            NULL,
    MaxValue     INT            NULL,
    Description  NVARCHAR(400)  NULL,
    UpdatedAt    DATETIME2      NOT NULL
      CONSTRAINT DF_SB_AppConfig_UpdatedAt DEFAULT (SYSUTCDATETIME()),
    UpdatedBy    NVARCHAR(120)  NULL,
    CONSTRAINT PK_SB_AppConfig PRIMARY KEY CLUSTERED (ConfigKey),
    CONSTRAINT CK_SB_AppConfig_ValueType
      CHECK (ValueType IN (N'int', N'bool', N'text')),
    CONSTRAINT CK_SB_AppConfig_Range
      CHECK (MinValue IS NULL OR MaxValue IS NULL OR MinValue <= MaxValue)
  );
END;
GO

/* ---------- SB_Settings ---------- */
IF OBJECT_ID(N'dbo.SB_Settings', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.SB_Settings (
    Id INT IDENTITY(1, 1) NOT NULL,
    SettingKey NVARCHAR(100) NOT NULL,
    SettingValue NVARCHAR(MAX) NULL,
    SettingType NVARCHAR(50) NOT NULL
      CONSTRAINT DF_SB_Settings_SettingType DEFAULT (N'text'),
    Description NVARCHAR(255) NULL,
    IsActive BIT NOT NULL
      CONSTRAINT DF_SB_Settings_IsActive DEFAULT (1),
    CreatedAt DATETIME2 NOT NULL
      CONSTRAINT DF_SB_Settings_CreatedAt DEFAULT (SYSUTCDATETIME()),
    UpdatedAt DATETIME2 NOT NULL
      CONSTRAINT DF_SB_Settings_UpdatedAt DEFAULT (SYSUTCDATETIME()),
    CONSTRAINT PK_SB_Settings PRIMARY KEY CLUSTERED (Id),
    CONSTRAINT UQ_SB_Settings_SettingKey UNIQUE (SettingKey)
  );
END;
GO

/* ---------- SB_Customers (empty until application registration) ---------- */
IF OBJECT_ID(N'dbo.SB_Customers', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.SB_Customers (
    Id INT IDENTITY(1, 1) NOT NULL,
    FullName NVARCHAR(150) NOT NULL,
    Phone NVARCHAR(50) NULL,
    Email NVARCHAR(255) NOT NULL,
    PasswordHash NVARCHAR(255) NOT NULL,
    Address NVARCHAR(255) NULL,
    City NVARCHAR(100) NULL,
    IsActive BIT NOT NULL
      CONSTRAINT DF_SB_Customers_IsActive DEFAULT (1),
    CreatedAt DATETIME2 NOT NULL
      CONSTRAINT DF_SB_Customers_CreatedAt DEFAULT (SYSUTCDATETIME()),
    UpdatedAt DATETIME2 NOT NULL
      CONSTRAINT DF_SB_Customers_UpdatedAt DEFAULT (SYSUTCDATETIME()),
    CONSTRAINT PK_SB_Customers PRIMARY KEY CLUSTERED (Id),
    CONSTRAINT UQ_SB_Customers_Email UNIQUE (Email)
  );
END;
GO

/* ---------- SB_CartItems ---------- */
IF OBJECT_ID(N'dbo.SB_CartItems', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.SB_CartItems (
    Id INT IDENTITY(1, 1) NOT NULL,
    CustomerId INT NULL,
    SessionId NVARCHAR(100) NULL,
    ProductId UNIQUEIDENTIFIER NOT NULL,
    Quantity INT NOT NULL
      CONSTRAINT DF_SB_CartItems_Quantity DEFAULT (1),
    CreatedAt DATETIME2 NOT NULL
      CONSTRAINT DF_SB_CartItems_CreatedAt DEFAULT (SYSUTCDATETIME()),
    UpdatedAt DATETIME2 NOT NULL
      CONSTRAINT DF_SB_CartItems_UpdatedAt DEFAULT (SYSUTCDATETIME()),
    CONSTRAINT PK_SB_CartItems PRIMARY KEY CLUSTERED (Id),
    CONSTRAINT CK_SB_CartItems_Quantity CHECK (Quantity > 0),
    CONSTRAINT CK_SB_CartItems_Owner CHECK (
      (CustomerId IS NOT NULL AND SessionId IS NULL)
      OR (CustomerId IS NULL AND SessionId IS NOT NULL)
    ),
    CONSTRAINT FK_SB_CartItems_Customer
      FOREIGN KEY (CustomerId) REFERENCES dbo.SB_Customers (Id),
    CONSTRAINT FK_SB_CartItems_Product
      FOREIGN KEY (ProductId) REFERENCES dbo.SB_Products (ProductId)
  );

  CREATE INDEX IX_SB_CartItems_CustomerId
    ON dbo.SB_CartItems (CustomerId)
    WHERE CustomerId IS NOT NULL;

  CREATE INDEX IX_SB_CartItems_SessionId
    ON dbo.SB_CartItems (SessionId)
    WHERE SessionId IS NOT NULL;

  CREATE UNIQUE INDEX UQ_SB_CartItems_Customer_Product
    ON dbo.SB_CartItems (CustomerId, ProductId)
    WHERE CustomerId IS NOT NULL;

  CREATE UNIQUE INDEX UQ_SB_CartItems_Session_Product
    ON dbo.SB_CartItems (SessionId, ProductId)
    WHERE SessionId IS NOT NULL AND CustomerId IS NULL;
END;
GO

/* ---------- SB_SmartBasketSessions ---------- */
IF OBJECT_ID(N'dbo.SB_SmartBasketSessions', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.SB_SmartBasketSessions (
    Id INT IDENTITY(1, 1) NOT NULL,
    CustomerId INT NOT NULL,
    TokenHash NVARCHAR(128) NOT NULL,
    Status NVARCHAR(20) NOT NULL
      CONSTRAINT DF_SB_SmartBasketSessions_Status DEFAULT (N'active'),
    ExpiresAt DATETIME2 NOT NULL,
    CreatedAt DATETIME2 NOT NULL
      CONSTRAINT DF_SB_SmartBasketSessions_CreatedAt DEFAULT (SYSUTCDATETIME()),
    ValidatedAt DATETIME2 NULL,
    RejectedAt DATETIME2 NULL,
    CancelledAt DATETIME2 NULL,
    ValidationNote NVARCHAR(500) NULL,
    CONSTRAINT PK_SB_SmartBasketSessions PRIMARY KEY CLUSTERED (Id),
    CONSTRAINT UQ_SB_SmartBasketSessions_TokenHash UNIQUE (TokenHash),
    CONSTRAINT CK_SB_SmartBasketSessions_Status CHECK (
      Status IN (N'active', N'validated', N'rejected', N'expired', N'cancelled')
    ),
    CONSTRAINT FK_SB_SmartBasketSessions_Customer
      FOREIGN KEY (CustomerId) REFERENCES dbo.SB_Customers (Id) ON DELETE CASCADE
  );

  CREATE INDEX IX_SB_SmartBasketSessions_CustomerId_Status
    ON dbo.SB_SmartBasketSessions (CustomerId, Status);

  CREATE INDEX IX_SB_SmartBasketSessions_ExpiresAt
    ON dbo.SB_SmartBasketSessions (ExpiresAt);
END;
GO

/* ---------- SB_SmartBasketItems (016 + 039 simulated-weight columns) ---------- */
IF OBJECT_ID(N'dbo.SB_SmartBasketItems', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.SB_SmartBasketItems (
    Id INT IDENTITY(1, 1) NOT NULL,
    SessionId INT NOT NULL,
    ProductId UNIQUEIDENTIFIER NOT NULL,
    ProductNameSnapshot NVARCHAR(255) NOT NULL,
    BarcodeSnapshot NVARCHAR(120) NULL,
    Quantity INT NOT NULL,
    UnitPriceSnapshot DECIMAL(18, 3) NULL,
    CreatedAt DATETIME2 NOT NULL
      CONSTRAINT DF_SB_SmartBasketItems_CreatedAt DEFAULT (SYSUTCDATETIME()),
    SimulatedUnitWeightGrams INT NULL,
    SimulatedLineWeightGrams INT NULL,
    SimulatedWeightProvenance NVARCHAR(40) NULL,
    SimulatedWeightFixtureVersion NVARCHAR(20) NULL,
    CONSTRAINT PK_SB_SmartBasketItems PRIMARY KEY CLUSTERED (Id),
    CONSTRAINT CK_SB_SmartBasketItems_Quantity CHECK (Quantity > 0),
    CONSTRAINT CK_SB_SmartBasketItems_SimulatedUnitWeightGrams
      CHECK (SimulatedUnitWeightGrams IS NULL OR SimulatedUnitWeightGrams > 0),
    CONSTRAINT CK_SB_SmartBasketItems_SimulatedLineWeightGrams
      CHECK (SimulatedLineWeightGrams IS NULL OR SimulatedLineWeightGrams > 0),
    CONSTRAINT CK_SB_SmartBasketItems_SimulatedWeightPair
      CHECK (
        (SimulatedUnitWeightGrams IS NULL AND SimulatedLineWeightGrams IS NULL)
        OR (SimulatedUnitWeightGrams IS NOT NULL AND SimulatedLineWeightGrams IS NOT NULL)
      ),
    CONSTRAINT CK_SB_SmartBasketItems_SimulatedWeightProvenance
      CHECK (
        SimulatedWeightProvenance IS NULL
        OR SimulatedWeightProvenance = N'synthetic'
      ),
    CONSTRAINT FK_SB_SmartBasketItems_Session
      FOREIGN KEY (SessionId) REFERENCES dbo.SB_SmartBasketSessions (Id)
      ON DELETE CASCADE
  );

  CREATE INDEX IX_SB_SmartBasketItems_SessionId
    ON dbo.SB_SmartBasketItems (SessionId);
END;
GO

/* ---------- SB_CashierValidations ---------- */
IF OBJECT_ID(N'dbo.SB_CashierValidations', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.SB_CashierValidations (
    Id INT IDENTITY(1, 1) NOT NULL,
    SessionId INT NOT NULL,
    ValidatedBy NVARCHAR(120) NULL,
    ValidationStatus NVARCHAR(20) NOT NULL,
    Notes NVARCHAR(500) NULL,
    CreatedAt DATETIME2 NOT NULL
      CONSTRAINT DF_SB_CashierValidations_CreatedAt DEFAULT (SYSUTCDATETIME()),
    CONSTRAINT PK_SB_CashierValidations PRIMARY KEY CLUSTERED (Id),
    CONSTRAINT CK_SB_CashierValidations_Status CHECK (
      ValidationStatus IN (N'validated', N'rejected')
    ),
    CONSTRAINT FK_SB_CashierValidations_Session
      FOREIGN KEY (SessionId) REFERENCES dbo.SB_SmartBasketSessions (Id)
      ON DELETE CASCADE
  );

  CREATE INDEX IX_SB_CashierValidations_SessionId
    ON dbo.SB_CashierValidations (SessionId);
END;
GO

SELECT t.name AS TableName
FROM sys.tables t
WHERE t.schema_id = SCHEMA_ID(N'dbo')
ORDER BY t.name;
GO
