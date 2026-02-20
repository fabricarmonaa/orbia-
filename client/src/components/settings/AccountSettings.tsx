import { useMemo, useRef, useState } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { apiRequest, getToken, type AuthUser, updateCurrentUser, logout } from "@/lib/auth";
import { parseApiError } from "@/lib/api-errors";
import { useToast } from "@/hooks/use-toast";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Checkbox } from "@/components/ui/checkbox";

const AMBIGUOUS = /[O0Il]/g;

function evaluate(password: string) {
  const hasUpper = /[A-Z]/.test(password);
  const hasLower = /[a-z]/.test(password);
  const hasNumber = /\d/.test(password);
  const hasSymbol = /[^A-Za-z0-9]/.test(password);
  const minLength = password.length >= 12;
  const common = ["password123!", "password", "123456", "qwerty"].includes(password.toLowerCase());
  let score = 0;
  if (minLength) score += 20;
  if (password.length >= 16) score += 20;
  if (hasUpper) score += 15;
  if (hasLower) score += 15;
  if (hasNumber) score += 15;
  if (hasSymbol) score += 15;
  if (!common) score += 10;
  return {
    score: Math.min(100, score),
    checks: {
      minLength,
      upper: hasUpper,
      lower: hasLower,
      number: hasNumber,
      symbol: hasSymbol,
      notCommon: !common,
    },
  };
}

function generatePassword(length: number, includeSymbols: boolean, avoidAmbiguous: boolean) {
  const letters = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
  const numbers = "23456789";
  const symbols = "!@#$%^&*()-_=+[]{};:,.?";
  const fallbackLetters = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
  const fallbackNumbers = "0123456789";

  const a = avoidAmbiguous ? letters : fallbackLetters;
  const n = avoidAmbiguous ? numbers : fallbackNumbers;
  const pool = `${a}${n}${includeSymbols ? symbols : ""}`;
  const mandatory = [a[Math.floor(Math.random() * a.length)], a.toLowerCase()[Math.floor(Math.random() * a.length)], n[Math.floor(Math.random() * n.length)], includeSymbols ? symbols[Math.floor(Math.random() * symbols.length)] : a[Math.floor(Math.random() * a.length)]];
  let out = mandatory.join("");
  while (out.length < length) out += pool[Math.floor(Math.random() * pool.length)];
  return out
    .split("")
    .sort(() => Math.random() - 0.5)
    .join("")
    .slice(0, length)
    .replace(AMBIGUOUS, avoidAmbiguous ? "A" : "$&");
}

export function AccountSettings({ user }: { user: AuthUser | null }) {
  const { toast } = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPasswords, setShowPasswords] = useState(false);
  const [suggestLength, setSuggestLength] = useState(20);
  const [includeSymbols, setIncludeSymbols] = useState(true);
  const [avoidAmbiguous, setAvoidAmbiguous] = useState(true);
  const [suggestedPassword, setSuggestedPassword] = useState(() => generatePassword(20, true, true));
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [deletePassword, setDeletePassword] = useState("");
  const [deleteWithExport, setDeleteWithExport] = useState(true);
  const [deleting, setDeleting] = useState(false);
  if (!user) return null;
  const currentUser = user;

  const strength = useMemo(() => evaluate(newPassword), [newPassword]);
  const strengthLabel = strength.score < 40 ? "Débil" : strength.score < 65 ? "Media" : strength.score < 85 ? "Fuerte" : "Excelente";

  const initials = currentUser.fullName?.split(" ").map((n: string) => n[0]).join("").substring(0, 2).toUpperCase() || "U";

  async function handleAvatarUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("avatar", file);
      const token = getToken();
      const res = await fetch("/api/uploads/avatar", { method: "POST", headers: token ? { Authorization: `Bearer ${token}` } : {}, body: formData });
      if (!res.ok) {
        const info = await parseApiError(res, { maxUploadBytes: 2 * 1024 * 1024 });
        throw new Error(info.message);
      }
      const data = await res.json();
      await apiRequest("PUT", "/api/me/profile", { avatarUrl: data.url as string });
      updateCurrentUser({ avatarUrl: data.url as string });
      toast({ title: "Foto actualizada" });
    } catch (err: any) {
      toast({ title: "No se pudo actualizar la foto", description: err.message, variant: "destructive" });
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function handleChangePassword() {
    if (!currentPassword || !newPassword || !confirmPassword) return toast({ title: "Completá todos los campos", variant: "destructive" });
    if (newPassword !== confirmPassword) return toast({ title: "La confirmación no coincide", variant: "destructive" });
    setChangingPassword(true);
    try {
      await apiRequest("PATCH", "/api/me/password", { currentPassword, newPassword, confirmPassword });
      setCurrentPassword(""); setNewPassword(""); setConfirmPassword("");
      updateCurrentUser({ passwordWeak: false });
      toast({ title: "Contraseña actualizada" });
    } catch (err: any) {
      toast({ title: "No se pudo cambiar la contraseña", description: err.message, variant: "destructive" });
    } finally {
      setChangingPassword(false);
    }
  }

  function regenerate() { setSuggestedPassword(generatePassword(suggestLength, includeSymbols, avoidAmbiguous)); }
  async function copySuggested() { await navigator.clipboard.writeText(suggestedPassword); toast({ title: "Contraseña copiada" }); }
  function useSuggested() { setNewPassword(suggestedPassword); setConfirmPassword(suggestedPassword); }

  async function handleDeleteAccount() {
    if (currentUser.role !== "admin") return toast({ title: "Acceso denegado", variant: "destructive" });
    if (deleteConfirmText !== "ELIMINAR MI CUENTA") return toast({ title: "Confirmación inválida", description: "Debes escribir exactamente ELIMINAR MI CUENTA", variant: "destructive" });
    if (!deletePassword) return toast({ title: "Contraseña requerida", variant: "destructive" });
    setDeleting(true);
    try {
      const res = await apiRequest("DELETE", "/api/tenant", { confirm: deleteConfirmText, password: deletePassword, exportBeforeDelete: deleteWithExport });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "No se pudo eliminar la cuenta");
      if (data?.exportUrl) window.open(data.exportUrl, "_blank", "noopener,noreferrer");
      sessionStorage.setItem("orbia_logout_message", "Cuenta eliminada.");
      logout("manual");
    } catch (err: any) {
      toast({ title: "No se pudo eliminar la cuenta", description: err.message, variant: "destructive" });
    } finally { setDeleting(false); }
  }

  return (<Card><CardHeader><h3 className="font-semibold">Perfil de usuario</h3><p className="text-sm text-muted-foreground">Información básica de tu cuenta</p></CardHeader><CardContent className="space-y-6">
    {currentUser.passwordWeak ? <div className="rounded border border-amber-300 bg-amber-50 px-3 py-2 text-sm">Tu contraseña actual es débil. Recomendamos actualizarla.</div> : null}
    <div className="flex items-center gap-4"><Avatar className="h-14 w-14"><AvatarImage src={currentUser.avatarUrl || undefined} alt={currentUser.fullName} /><AvatarFallback>{initials}</AvatarFallback></Avatar><div><p className="font-medium">{currentUser.fullName}</p><p className="text-sm text-muted-foreground">{currentUser.email}</p><p className="text-xs text-muted-foreground mt-1">Rol: {currentUser.role}</p></div></div>

    <div className="space-y-2"><Label htmlFor="avatar-upload">Cambiar foto</Label><Input id="avatar-upload" ref={inputRef} type="file" accept="image/*" onChange={handleAvatarUpload} disabled={uploading} /><Button size="sm" variant="outline" onClick={() => inputRef.current?.click()} disabled={uploading}>{uploading ? "Subiendo..." : "Seleccionar foto"}</Button></div>

    <div className="space-y-3 border rounded-md p-4">
      <div className="flex items-center justify-between"><h4 className="font-medium">Cambiar contraseña</h4><Button variant="ghost" size="sm" onClick={() => setShowPasswords((s) => !s)}>{showPasswords ? "Ocultar" : "Ver"}</Button></div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3"><div className="space-y-1"><Label>Contraseña actual</Label><Input type={showPasswords ? "text" : "password"} value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} /></div><div className="space-y-1"><Label>Nueva contraseña</Label><Input type={showPasswords ? "text" : "password"} value={newPassword} onChange={(e) => setNewPassword(e.target.value)} /></div><div className="space-y-1"><Label>Confirmar nueva contraseña</Label><Input type={showPasswords ? "text" : "password"} value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} /></div></div>
      <div className="space-y-2">
        <div className="flex items-center justify-between text-sm"><span>Fuerza: {strengthLabel}</span><span>{strength.score}/100</span></div>
        <div className="h-2 w-full rounded bg-muted"><div className="h-2 rounded bg-primary" style={{ width: `${strength.score}%` }} /></div>
        <ul className="text-xs grid grid-cols-2 gap-1">
          <li>{strength.checks.minLength ? "✅" : "⬜"} 12+ caracteres</li>
          <li>{strength.checks.upper ? "✅" : "⬜"} 1 mayúscula</li>
          <li>{strength.checks.lower ? "✅" : "⬜"} 1 minúscula</li>
          <li>{strength.checks.number ? "✅" : "⬜"} 1 número</li>
          <li>{strength.checks.symbol ? "✅" : "⬜"} 1 símbolo</li>
          <li>{strength.checks.notCommon ? "✅" : "⬜"} no común</li>
        </ul>
      </div>
      <Button onClick={handleChangePassword} disabled={changingPassword}>{changingPassword ? "Guardando..." : "Actualizar contraseña"}</Button>
    </div>

    <div className="space-y-3 border rounded-md p-4">
      <h4 className="font-medium">Sugerencia de contraseña segura</h4>
      <Input type={showPasswords ? "text" : "password"} value={suggestedPassword} readOnly />
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-sm">
        <div><Label>Largo: {suggestLength}</Label><input className="w-full" type="range" min={12} max={32} value={suggestLength} onChange={(e) => setSuggestLength(Number(e.target.value))} /></div>
        <div className="flex items-center justify-between"><Label>Incluir símbolos</Label><Switch checked={includeSymbols} onCheckedChange={setIncludeSymbols} /></div>
        <div className="flex items-center justify-between"><Label>Evitar ambiguos</Label><Switch checked={avoidAmbiguous} onCheckedChange={setAvoidAmbiguous} /></div>
      </div>
      <div className="flex gap-2"><Button variant="outline" onClick={regenerate}>Regenerar</Button><Button variant="outline" onClick={copySuggested}>Copiar</Button><Button onClick={useSuggested}>Usar esta contraseña</Button></div>
    </div>

    {currentUser.role === "admin" && (<div className="space-y-3 border border-red-300 rounded-md p-4 bg-red-50/40"><h4 className="font-semibold text-red-700">Eliminar cuenta</h4><p className="text-sm text-muted-foreground">Una vez que se elimine su cuenta, todos sus recursos y datos se eliminarán permanentemente. Antes de eliminar su cuenta, descargue cualquier dato o información que desee conservar.</p><div className="space-y-1"><Label>Escribí exactamente: ELIMINAR MI CUENTA</Label><Input value={deleteConfirmText} onChange={(e) => setDeleteConfirmText(e.target.value)} placeholder="ELIMINAR MI CUENTA" /></div><div className="space-y-1"><Label>Contraseña actual</Label><Input type="password" value={deletePassword} onChange={(e) => setDeletePassword(e.target.value)} /></div><div className="flex items-center gap-2"><Checkbox checked={deleteWithExport} onCheckedChange={(v) => setDeleteWithExport(Boolean(v))} /><span className="text-sm">Exportar datos antes de eliminar</span></div><AlertDialog><AlertDialogTrigger asChild><Button variant="destructive" disabled={deleting || deleteConfirmText !== "ELIMINAR MI CUENTA" || !deletePassword}>Eliminar cuenta</Button></AlertDialogTrigger><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Esta acción es irreversible</AlertDialogTitle><AlertDialogDescription>Se eliminarán permanentemente todos los datos del tenant.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Cancelar</AlertDialogCancel><AlertDialogAction onClick={handleDeleteAccount}>Confirmar eliminación</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog></div>)}
  </CardContent></Card>);
}
