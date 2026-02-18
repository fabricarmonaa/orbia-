import re

from parsers.base import extract_number


def parse_cash_intent(text: str) -> dict:
    """Parse cash movement intent from transcription using regex."""
    intent: dict = {"action": "create_movement"}
    lower = text.lower()

    if any(w in lower for w in ["ingreso", "entrada", "cobro", "cobré", "recibí", "venta"]):
        intent["type"] = "ingreso"
    elif any(w in lower for w in ["egreso", "gasto", "pagué", "compré", "salida"]):
        intent["type"] = "egreso"
    else:
        intent["type"] = "ingreso"

    method_map = {
        "efectivo": "efectivo",
        "cash": "efectivo",
        "transferencia": "transferencia",
        "transf": "transferencia",
        "tarjeta": "tarjeta",
        "débito": "tarjeta",
        "crédito": "tarjeta",
        "mercadopago": "mercadopago",
        "mercado pago": "mercadopago",
        "mp": "mercadopago",
    }
    for keyword, method in method_map.items():
        if keyword in lower:
            intent["method"] = method
            break
    if "method" not in intent:
        intent["method"] = "efectivo"

    amount_match = re.search(r'(?:de|por|son|monto|total)?\s*\$?\s*(\d+(?:[.,]\d+)?)', lower)
    if amount_match:
        intent["amount"] = float(amount_match.group(1).replace(",", "."))

    desc_match = re.search(r'(?:por|concepto|descripción|motivo|razón)\s+(.+?)(?:\s+(?:de|por|en)\s+\d|\.|$)', text, re.IGNORECASE)
    if desc_match:
        desc = desc_match.group(1).strip()
        if len(desc) > 3:
            intent["description"] = desc[:200]

    return intent
