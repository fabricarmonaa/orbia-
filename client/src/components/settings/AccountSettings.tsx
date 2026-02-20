import { useRef, useState } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiRequest, getToken, type AuthUser, updateCurrentUser, logout } from "@/lib/auth";
import { parseApiError } from "@/lib/api-errors";
import { useToast } from "@/hooks/use-toast";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Checkbox } from "@/components/ui/checkbox";

export function AccountSettings({ user }: { user: AuthUser | null }) {
  const { toast } = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [deletePassword, setDeletePassword] = useState("");
  const [deleteWithExport, setDeleteWithExport] = useState(true);
  const [deleting, setDeleting] = useState(false);
  if (!user) return null;
  const currentUser = user;

  const initials = currentUser.fullName
    ?.split(" ")
    .map((n: string) => n[0])
    .join("")
    .substring(0, 2)
    .toUpperCase() || "U";

  async function handleAvatarUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("avatar", file);
      const token = getToken();
      const res = await fetch("/api/uploads/avatar", {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: formData,
      });
      if (!res.ok) {
        const info = await parseApiError(res, { maxUploadBytes: 2 * 1024 * 1024 });
        throw new Error(info.message);
      }
      const data = await res.json();
      const avatarUrl = data.url as string;
      await apiRequest("PUT", "/api/me/profile", { avatarUrl });
      updateCurrentUser({ avatarUrl });
      toast({ title: "Foto actualizada" });
    } catch (err: any) {
      toast({ title: "No se pudo actualizar la foto", description: err.message, variant: "destructive" });
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function handleChangePassword() {
    if (!currentPassword || !newPassword || !confirmPassword) {
      toast({ title: "Completá todos los campos", variant: "destructive" });
      return;
    }
    if (newPassword !== confirmPassword) {
      toast({ title: "La confirmación no coincide", variant: "destructive" });
      return;
    }
    setChangingPassword(true);
    try {
      await apiRequest("PUT", "/api/me/password", {
        currentPassword,
        newPassword,
        confirmPassword,
      });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      toast({ title: "Contraseña actualizada" });
    } catch (err: any) {
      toast({ title: "No se pudo cambiar la contraseña", description: err.message, variant: "destructive" });
    } finally {
      setChangingPassword(false);
    }
  }



  async function handleDeleteAccount() {
    if (currentUser.role !== "admin") {
      toast({ title: "Acceso denegado", variant: "destructive" });
      return;
    }
    if (deleteConfirmText !== "ELIMINAR MI CUENTA") {
      toast({ title: "Confirmación inválida", description: "Debes escribir exactamente ELIMINAR MI CUENTA", variant: "destructive" });
      return;
    }
    if (!deletePassword) {
      toast({ title: "Contraseña requerida", variant: "destructive" });
      return;
    }

    setDeleting(true);
    try {
      const res = await apiRequest("DELETE", "/api/tenant", {
        confirm: deleteConfirmText,
        password: deletePassword,
        exportBeforeDelete: deleteWithExport,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "No se pudo eliminar la cuenta");
      if (data?.exportUrl) {
        window.open(data.exportUrl, "_blank", "noopener,noreferrer");
      }
      sessionStorage.setItem("orbia_logout_message", "Cuenta eliminada.");
      logout("manual");
    } catch (err: any) {
      toast({ title: "No se pudo eliminar la cuenta", description: err.message, variant: "destructive" });
    } finally {
      setDeleting(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <h3 className="font-semibold">Perfil de usuario</h3>
        <p className="text-sm text-muted-foreground">Información básica de tu cuenta</p>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="flex items-center gap-4">
          <Avatar className="h-14 w-14">
            <AvatarImage src={currentUser.avatarUrl || undefined} alt={currentUser.fullName} />
            <AvatarFallback>{initials}</AvatarFallback>
          </Avatar>
          <div>
            <p className="font-medium">{currentUser.fullName}</p>
            <p className="text-sm text-muted-foreground">{currentUser.email}</p>
            <p className="text-xs text-muted-foreground mt-1">Rol: {currentUser.role}</p>
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="avatar-upload">Cambiar foto</Label>
          <Input id="avatar-upload" ref={inputRef} type="file" accept="image/*" onChange={handleAvatarUpload} disabled={uploading} />
          <Button size="sm" variant="outline" onClick={() => inputRef.current?.click()} disabled={uploading}>
            {uploading ? "Subiendo..." : "Seleccionar foto"}
          </Button>
        </div>

        <div className="space-y-3 border rounded-md p-4">
          <h4 className="font-medium">Cambiar contraseña</h4>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="space-y-1">
              <Label>Contraseña actual</Label>
              <Input type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Nueva contraseña</Label>
              <Input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Confirmar nueva contraseña</Label>
              <Input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} />
            </div>
          </div>
          <Button onClick={handleChangePassword} disabled={changingPassword}>
            {changingPassword ? "Guardando..." : "Actualizar contraseña"}
          </Button>
        </div>
      

        {currentUser.role === "admin" && (
          <div className="space-y-3 border border-red-300 rounded-md p-4 bg-red-50/40">
            <h4 className="font-semibold text-red-700">Eliminar cuenta</h4>
            <p className="text-sm text-muted-foreground">
              Una vez que se elimine su cuenta, todos sus recursos y datos se eliminarán permanentemente. Antes de eliminar su cuenta, descargue cualquier dato o información que desee conservar.
            </p>
            <div className="space-y-1">
              <Label>Escribí exactamente: ELIMINAR MI CUENTA</Label>
              <Input value={deleteConfirmText} onChange={(e) => setDeleteConfirmText(e.target.value)} placeholder="ELIMINAR MI CUENTA" />
            </div>
            <div className="space-y-1">
              <Label>Contraseña actual</Label>
              <Input type="password" value={deletePassword} onChange={(e) => setDeletePassword(e.target.value)} />
            </div>
            <div className="flex items-center gap-2">
              <Checkbox checked={deleteWithExport} onCheckedChange={(v) => setDeleteWithExport(Boolean(v))} />
              <span className="text-sm">Exportar datos antes de eliminar</span>
            </div>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" disabled={deleting || deleteConfirmText !== "ELIMINAR MI CUENTA" || !deletePassword}>Eliminar cuenta</Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Esta acción es irreversible</AlertDialogTitle>
                  <AlertDialogDescription>
                    Se eliminarán permanentemente todos los datos del tenant.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                  <AlertDialogAction onClick={handleDeleteAccount}>Confirmar eliminación</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        )}

      </CardContent>
    </Card>
  );
}
