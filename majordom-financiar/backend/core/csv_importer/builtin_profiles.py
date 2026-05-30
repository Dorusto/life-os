"""
Built-in CSV bank profiles seeded into SQLite on startup.

Each entry is a dict with two keys:
  - "headers": list[str] — the exact column headers the bank exports
                           (used to compute the header_sig MD5 fingerprint)
  - "profile": dict — CsvProfile fields (everything except id and header_sig,
                       which are computed at seed time)

Sources: bank2ynab community profiles + user-confirmed ING NL English format.
"""

BUILTIN_PROFILES = [
    # -------------------------------------------------------------------------
    # ING Netherlands — English export, semicolon-separated
    # Download Statements → CSV → Semicolon-separated values (CSV)
    # Headers: Date;Name / Description;Account;Counterparty;Code;Debit/credit;
    #          Amount (EUR);Transaction type;Notifications;Resulting balance;Tag
    # -------------------------------------------------------------------------
    {
        "headers": [
            "Date", "Name / Description", "Account", "Counterparty", "Code",
            "Debit/credit", "Amount (EUR)", "Transaction type", "Notifications",
            "Resulting balance", "Tag",
        ],
        "profile": {
            "source_name": "ING",
            "col_date": "Date",
            "col_merchant": "Name / Description",
            "col_amount": "Amount (EUR)",
            "col_currency": "",
            "col_direction": "Debit/credit",
            "col_description": "Notifications",
            "expense_indicator": "Debit",
            "date_format": "%Y%m%d",
            "delimiter": ";",
            "decimal_sep": ",",
            "encoding": "utf-8",
            "confirmed": True,
            "col_transfer_indicator": "Code",
            "transfer_indicator_value": "GT",
        },
    },
    # -------------------------------------------------------------------------
    # ING Netherlands — English export, comma-separated
    # Download Statements → CSV → Comma-separated values (CSV)
    # Same column names as the semicolon format — different delimiter only.
    # -------------------------------------------------------------------------
    {
        "headers": [
            "Date", "Name / Description", "Account", "Counterparty", "Code",
            "Debit/credit", "Amount (EUR)", "Transaction type", "Notifications",
            "Resulting balance", "Tag",
        ],
        "profile": {
            "source_name": "ING",
            "col_date": "Date",
            "col_merchant": "Name / Description",
            "col_amount": "Amount (EUR)",
            "col_currency": "",
            "col_direction": "Debit/credit",
            "col_description": "Notifications",
            "expense_indicator": "Debit",
            "date_format": "%Y%m%d",
            "delimiter": ",",
            "decimal_sep": ",",
            "encoding": "utf-8",
            "confirmed": True,
            "col_transfer_indicator": "Code",
            "transfer_indicator_value": "GT",
        },
    },
    # -------------------------------------------------------------------------
    # ING Netherlands — Dutch export, semicolon-separated (legacy / 2020 format)
    # Headers: Datum;Naam / Omschrijving;Rekening;Tegenrekening;Code;Af Bij;
    #          Bedrag (EUR);MutatieSoort;Mededelingen;Saldo na mutatie;Tag
    # Source: bank2ynab [NL ING Checking 2020]
    # -------------------------------------------------------------------------
    {
        "headers": [
            "Datum", "Naam / Omschrijving", "Rekening", "Tegenrekening", "Code",
            "Af Bij", "Bedrag (EUR)", "MutatieSoort", "Mededelingen",
            "Saldo na mutatie", "Tag",
        ],
        "profile": {
            "source_name": "ING",
            "col_date": "Datum",
            "col_merchant": "Naam / Omschrijving",
            "col_amount": "Bedrag (EUR)",
            "col_currency": "",
            "col_direction": "Af Bij",
            "col_description": "Mededelingen",
            "expense_indicator": "Af",
            "date_format": "%Y%m%d",
            "delimiter": ";",
            "decimal_sep": ",",
            "encoding": "utf-8",
            "confirmed": True,
            "col_transfer_indicator": "Code",
            "transfer_indicator_value": "GT",
        },
    },
    # -------------------------------------------------------------------------
    # Revolut — English export
    # Headers: Type,Product,Started Date,Completed Date,Description,
    #          Amount,Fee,Currency,State,Balance
    # Source: bank2ynab [Revolut] + community
    # -------------------------------------------------------------------------
    {
        "headers": [
            "Type", "Product", "Started Date", "Completed Date", "Description",
            "Amount", "Fee", "Currency", "State", "Balance",
        ],
        "profile": {
            "source_name": "Revolut",
            "col_date": "Started Date",
            "col_merchant": "Description",
            "col_amount": "Amount",
            "col_currency": "Currency",
            "col_direction": "",
            "col_description": "Description",
            "expense_indicator": "",
            "date_format": "%Y-%m-%d %H:%M:%S",
            "delimiter": ",",
            "decimal_sep": ".",
            "encoding": "utf-8",
            "confirmed": True,
        },
    },
    # -------------------------------------------------------------------------
    # BUNQ — Desktop export, semicolon-separated
    # Headers: Date;Amount;Account from;Account receiving;Name account holder;Description
    # Source: bank2ynab [NL bunqDesktop software]
    # -------------------------------------------------------------------------
    {
        "headers": [
            "Date", "Amount", "Account from", "Account receiving",
            "Name account holder", "Description",
        ],
        "profile": {
            "source_name": "BUNQ",
            "col_date": "Date",
            "col_merchant": "Name account holder",
            "col_amount": "Amount",
            "col_currency": "",
            "col_direction": "",
            "col_description": "Description",
            "expense_indicator": "",
            "date_format": "%Y-%m-%d",
            "delimiter": ";",
            "decimal_sep": ",",
            "encoding": "utf-8",
            "confirmed": True,
        },
    },
]
