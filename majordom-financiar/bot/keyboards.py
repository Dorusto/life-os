"""
Inline keyboards for user interaction.

Used for:
- Confirming/correcting the predicted category
- Selecting the correct category
- Confirming a transaction
"""
from telegram import InlineKeyboardButton, InlineKeyboardMarkup
import json


def category_confirmation_keyboard(
    tx_id: int,
    predicted_category_id: str,
    confidence: float
) -> InlineKeyboardMarkup:
    """
    Keyboard for confirming the predicted category.
    Shown after processing a receipt.
    """
    buttons = [
        [
            InlineKeyboardButton(
                "✅ Correct",
                callback_data=json.dumps({
                    "action": "confirm_cat",
                    "tx_id": tx_id,
                    "cat": predicted_category_id
                })
            ),
            InlineKeyboardButton(
                "❌ Change",
                callback_data=json.dumps({
                    "action": "change_cat",
                    "tx_id": tx_id
                })
            )
        ]
    ]
    return InlineKeyboardMarkup(buttons)


def category_selection_keyboard(
    tx_id: int,
    categories: list[dict]
) -> InlineKeyboardMarkup:
    """
    Keyboard for selecting the correct category.
    Displays all available categories.
    """
    buttons = []
    row = []

    for i, cat in enumerate(categories):
        btn = InlineKeyboardButton(
            f"{cat['emoji']} {cat['name']}",
            callback_data=json.dumps({
                "action": "set_cat",
                "tx_id": tx_id,
                "cat": cat["id"]
            })
        )
        row.append(btn)

        # 2 buttons per row
        if len(row) == 2:
            buttons.append(row)
            row = []

    if row:
        buttons.append(row)

    return InlineKeyboardMarkup(buttons)


def transaction_confirm_keyboard(tx_id: int) -> InlineKeyboardMarkup:
    """Keyboard for final transaction confirmation."""
    buttons = [
        [
            InlineKeyboardButton(
                "💾 Save to Actual Budget",
                callback_data=json.dumps({
                    "action": "save_actual",
                    "tx_id": tx_id
                })
            )
        ],
        [
            InlineKeyboardButton(
                "✏️ Edit amount",
                callback_data=json.dumps({
                    "action": "edit_amount",
                    "tx_id": tx_id
                })
            ),
            InlineKeyboardButton(
                "🗑️ Cancel",
                callback_data=json.dumps({
                    "action": "cancel_tx",
                    "tx_id": tx_id
                })
            )
        ]
    ]
    return InlineKeyboardMarkup(buttons)


def csv_profile_confirm_keyboard() -> InlineKeyboardMarkup:
    """Keyboard for confirming the Ollama-detected profile."""
    return InlineKeyboardMarkup([
        [
            InlineKeyboardButton("✅ Yes, correct", callback_data="csv_pok"),
            InlineKeyboardButton("❌ Not correct", callback_data="csv_pno"),
        ]
    ])


def account_select_keyboard(tx_id: int, accounts: list[dict]) -> InlineKeyboardMarkup:
    """
    Keyboard for selecting an account when saving a receipt/manual transaction.
    Index is used in callback to stay under 64 bytes.
    """
    buttons = [
        [InlineKeyboardButton(
            f"💳 {acc['name']}",
            callback_data=json.dumps({"action": "sel_acc", "tx_id": tx_id, "i": i}),
        )]
        for i, acc in enumerate(accounts)
    ]
    return InlineKeyboardMarkup(buttons)


def csv_account_keyboard(accounts: list[dict]) -> InlineKeyboardMarkup:
    """
    Keyboard for selecting an account during CSV import.

    accounts: [{"id": "...", "name": "..."}]
    List index is used in callback (not UUID) to stay under 64 bytes.
    """
    buttons = [
        [InlineKeyboardButton(
            f"💳 {acc['name']}",
            callback_data=f"csv_asel_{i}",
        )]
        for i, acc in enumerate(accounts)
    ]
    buttons.append([InlineKeyboardButton("➕ New account", callback_data="csv_anew")])
    buttons.append([InlineKeyboardButton("❌ Cancel", callback_data="csv_acancel")])
    return InlineKeyboardMarkup(buttons)


def csv_import_keyboard(count: int) -> InlineKeyboardMarkup:
    """Keyboard for final import confirmation."""
    return InlineKeyboardMarkup([
        [InlineKeyboardButton(f"✅ Import {count} transactions", callback_data="csv_iok")],
        [InlineKeyboardButton("❌ Cancel", callback_data="csv_icancel")],
    ])


def yes_no_keyboard(action_id: str) -> InlineKeyboardMarkup:
    """Simple Yes/No keyboard."""
    return InlineKeyboardMarkup([
        [
            InlineKeyboardButton(
                "✅ Yes",
                callback_data=json.dumps({"action": "yes", "id": action_id})
            ),
            InlineKeyboardButton(
                "❌ No",
                callback_data=json.dumps({"action": "no", "id": action_id})
            )
        ]
    ])
