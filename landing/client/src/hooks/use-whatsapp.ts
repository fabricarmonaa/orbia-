import { useCallback } from 'react';

const PHONE_NUMBER = "5492236979026";

export function useWhatsApp() {
  const openWhatsApp = useCallback((message: string = "Hola! Quiero más información sobre ORBIA.") => {
    const url = `https://wa.me/${PHONE_NUMBER}?text=${encodeURIComponent(message)}`;
    window.open(url, '_blank');
  }, []);

  return { openWhatsApp, phoneNumberFormatted: "+54 9 223 697-9026" };
}
