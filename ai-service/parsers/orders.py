import re

from parsers.base import extract_number


def parse_order_intent(text: str) -> dict:
    """Parse order creation intent from transcription using regex."""
    intent: dict = {"action": "create_order"}
    lower = text.lower()

    type_map = {
        "encargo": "ENCARGO",
        "turno": "TURNO",
        "servicio": "SERVICIO",
        "pedido": "PEDIDO",
    }
    for keyword, order_type in type_map.items():
        if keyword in lower:
            intent["type"] = order_type
            break
    if "type" not in intent:
        intent["type"] = "PEDIDO"

    name_patterns = [
        r'(?:para|cliente|nombre)\s+([A-ZÁÉÍÓÚÑa-záéíóúñ]+(?:\s+[A-ZÁÉÍÓÚÑa-záéíóúñ]+)*)',
        r'(?:de|a nombre de)\s+([A-ZÁÉÍÓÚÑa-záéíóúñ]+(?:\s+[A-ZÁÉÍÓÚÑa-záéíóúñ]+)*)',
    ]
    for pattern in name_patterns:
        match = re.search(pattern, text, re.IGNORECASE)
        if match:
            name = match.group(1).strip()
            stop_words = {"pesos", "por", "total", "de", "con", "el", "la", "un", "una"}
            words = name.split()
            cleaned = []
            for w in words:
                if w.lower() in stop_words:
                    break
                cleaned.append(w)
            if cleaned:
                intent["customerName"] = " ".join(cleaned)
            break

    phone_match = re.search(r'(?:teléfono|tel|celular|número)\s*[:\s]*(\d[\d\s\-]{6,})', text, re.IGNORECASE)
    if phone_match:
        intent["customerPhone"] = re.sub(r'[\s\-]', '', phone_match.group(1))

    amount_match = re.search(r'(?:total|monto|precio|por|son|vale)\s*(?:de\s*)?(?:\$?\s*)(\d+(?:[.,]\d+)?)', lower)
    if amount_match:
        intent["totalAmount"] = float(amount_match.group(1).replace(",", "."))

    desc_patterns = [
        r'(?:descripción|detalle|nota|quiere|necesita|pide)\s*[:\s]*(.+?)(?:\.|$)',
    ]
    for pattern in desc_patterns:
        match = re.search(pattern, text, re.IGNORECASE)
        if match:
            desc = match.group(1).strip()
            if len(desc) > 5:
                intent["description"] = desc[:200]
            break

    return intent
