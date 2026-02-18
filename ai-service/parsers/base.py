import re
from typing import Optional


def extract_number(text: str) -> Optional[float]:
    """Extract numeric value from Spanish text, handling common patterns."""
    text = text.lower().strip()
    text = text.replace("mil", "000").replace("cien", "100").replace("doscientos", "200")
    text = text.replace("trescientos", "300").replace("quinientos", "500")
    numbers = re.findall(r'\d+(?:[.,]\d+)?', text)
    if numbers:
        return float(numbers[-1].replace(",", "."))
    word_map = {
        "uno": 1, "una": 1, "dos": 2, "tres": 3, "cuatro": 4, "cinco": 5,
        "seis": 6, "siete": 7, "ocho": 8, "nueve": 9, "diez": 10,
        "once": 11, "doce": 12, "quince": 15, "veinte": 20, "treinta": 30,
        "cuarenta": 40, "cincuenta": 50, "ciento": 100,
    }
    for word, val in word_map.items():
        if word in text:
            return float(val)
    return None
