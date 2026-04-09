"""
Inline keyboards pentru interacțiunea cu utilizatorul.

Folosite pentru:
- Confirmarea/corectarea categoriei
- Selectarea categoriei corecte
- Confirmarea tranzacției
"""
from telegram import InlineKeyboardButton, InlineKeyboardMarkup
import json


def category_confirmation_keyboard(
    tx_id: int,
    predicted_category_id: str,
    confidence: float
) -> InlineKeyboardMarkup:
    """
    Keyboard pentru confirmarea categoriei prezise.
    Apare după procesarea unui bon.
    """
    buttons = [
        [
            InlineKeyboardButton(
                "✅ Corect",
                callback_data=json.dumps({
                    "action": "confirm_cat",
                    "tx_id": tx_id,
                    "cat": predicted_category_id
                })
            ),
            InlineKeyboardButton(
                "❌ Schimbă",
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
    Keyboard pentru selectarea categoriei corecte.
    Afișează toate categoriile disponibile.
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

        # 2 butoane per rând
        if len(row) == 2:
            buttons.append(row)
            row = []

    if row:
        buttons.append(row)

    return InlineKeyboardMarkup(buttons)


def transaction_confirm_keyboard(tx_id: int) -> InlineKeyboardMarkup:
    """Keyboard pentru confirmarea finală a tranzacției."""
    buttons = [
        [
            InlineKeyboardButton(
                "💾 Salvează în Actual Budget",
                callback_data=json.dumps({
                    "action": "save_actual",
                    "tx_id": tx_id
                })
            )
        ],
        [
            InlineKeyboardButton(
                "✏️ Editează suma",
                callback_data=json.dumps({
                    "action": "edit_amount",
                    "tx_id": tx_id
                })
            ),
            InlineKeyboardButton(
                "🗑️ Anulează",
                callback_data=json.dumps({
                    "action": "cancel_tx",
                    "tx_id": tx_id
                })
            )
        ]
    ]
    return InlineKeyboardMarkup(buttons)


def yes_no_keyboard(action_id: str) -> InlineKeyboardMarkup:
    """Keyboard simplu Da/Nu."""
    return InlineKeyboardMarkup([
        [
            InlineKeyboardButton(
                "✅ Da",
                callback_data=json.dumps({"action": "yes", "id": action_id})
            ),
            InlineKeyboardButton(
                "❌ Nu",
                callback_data=json.dumps({"action": "no", "id": action_id})
            )
        ]
    ])
