interface Props {
  text: string;
}

export function WhatsAppMessagePreview({ text }: Props) {
  return (
    <div className="rounded-lg border bg-[#e7ffdb] max-w-md ml-auto p-3 shadow-sm" data-testid="whatsapp-preview-bubble">
      <p className="text-sm whitespace-pre-wrap text-slate-800">{text || "Vista previa del mensaje"}</p>
      <div className="text-[10px] text-slate-500 mt-2 text-right">12:34</div>
    </div>
  );
}
