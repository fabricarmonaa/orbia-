import re

from parsers.base import extract_number


def parse_product_intent(text: str) -> dict:
    """Parse product creation intent from transcription using regex."""
    intent: dict = {"action": "create_product"}
    lower = text.lower()

    name_patterns = [
        r'(?:producto|artículo|item)\s+(?:llamado|nombre)?\s*[:\s]*([A-ZÁÉÍÓÚÑa-záéíóúñ0-9]+(?:\s+[A-ZÁÉÍÓÚÑa-záéíóúñ0-9]+)*)',
        r'(?:agregar|crear|nuevo)\s+([A-ZÁÉÍÓÚÑa-záéíóúñ0-9]+(?:\s+[A-ZÁÉÍÓÚÑa-záéíóúñ0-9]+)*)',
    ]
    for pattern in name_patterns:
        match = re.search(pattern, text, re.IGNORECASE)
        if match:
            name = match.group(1).strip()
            stop_words = {"precio", "costo", "stock", "a", "de", "por", "con"}
            words = name.split()
            cleaned = []
            for w in words:
                if w.lower() in stop_words:
                    break
                cleaned.append(w)
            if cleaned:
                intent["name"] = " ".join(cleaned)
            break

    price_match = re.search(r'(?:precio|vale|cuesta)\s*(?:de\s*)?(?:\$?\s*)(\d+(?:[.,]\d+)?)', lower)
    if price_match:
        intent["price"] = float(price_match.group(1).replace(",", "."))

    cost_match = re.search(r'(?:costo|me sale|me cuesta)\s*(?:de\s*)?(?:\$?\s*)(\d+(?:[.,]\d+)?)', lower)
    if cost_match:
        intent["cost"] = float(cost_match.group(1).replace(",", "."))

    stock_match = re.search(r'(?:stock|cantidad|unidades|hay)\s*(?:de\s*)?(\d+)', lower)
    if stock_match:
        intent["stock"] = int(stock_match.group(1))

    sku_match = re.search(r'(?:sku|código)\s*[:\s]*([A-Za-z0-9\-]+)', text, re.IGNORECASE)
    if sku_match:
        intent["sku"] = sku_match.group(1)

    return intent
