import { useRef, useState } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiRequest, getToken, type AuthUser, updateCurrentUser } from "@/lib/auth";
import { parseApiError } from "@/lib/api-errors";
import { useToast } from "@/hooks/use-toast";

export function AccountSettings({ user }: { user: AuthUser | null }) {
  const { toast } = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  if (!user) return null;

  const initials = user.fullName
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

  return (
    <Card>
      <CardHeader>
        <h3 className="font-semibold">Perfil de usuario</h3>
        <p className="text-sm text-muted-foreground">Información básica de tu cuenta</p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-4">
          <Avatar className="h-14 w-14">
            <AvatarImage src={user.avatarUrl || undefined} alt={user.fullName} />
            <AvatarFallback>{initials}</AvatarFallback>
          </Avatar>
          <div>
            <p className="font-medium">{user.fullName}</p>
            <p className="text-sm text-muted-foreground">{user.email}</p>
            <p className="text-xs text-muted-foreground mt-1">Rol: {user.role}</p>
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="avatar-upload">Cambiar foto</Label>
          <Input id="avatar-upload" ref={inputRef} type="file" accept="image/*" onChange={handleAvatarUpload} disabled={uploading} />
          <Button size="sm" variant="outline" onClick={() => inputRef.current?.click()} disabled={uploading}>
            {uploading ? "Subiendo..." : "Seleccionar foto"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
