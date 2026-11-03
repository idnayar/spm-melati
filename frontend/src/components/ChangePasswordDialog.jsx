import { useState } from "react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/common";
import { api, errMsg } from "@/lib/api";

export const ChangePasswordDialog = ({ open, onOpenChange }) => {
  const [f, setF] = useState({ old_password: "", new_password: "" });
  const save = async () => {
    try {
      await api.post("/auth/change-password", f);
      toast.success("Kata sandi diperbarui");
      onOpenChange(false);
      setF({ old_password: "", new_password: "" });
    } catch (e) { toast.error(errMsg(e)); }
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>Ubah kata sandi</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <Field label="Kata sandi lama"><Input data-testid="old-password-input" type="password" value={f.old_password} onChange={(e) => setF({ ...f, old_password: e.target.value })} /></Field>
          <Field label="Kata sandi baru (min. 6 karakter)"><Input data-testid="new-password-input" type="password" value={f.new_password} onChange={(e) => setF({ ...f, new_password: e.target.value })} /></Field>
        </div>
        <DialogFooter><Button data-testid="save-password-button" className="btn-primary" onClick={save}>Simpan</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
