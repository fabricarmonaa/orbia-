import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { hasDialogDescription } from "./dialog";
import { DialogDescription, DialogHeader, DialogTitle } from "./dialog";

test("detecta cuando un dialog incluye DialogDescription anidado", () => {
  const children = (
    <DialogHeader>
      <DialogTitle>Título</DialogTitle>
      <DialogDescription>Descripción accesible</DialogDescription>
    </DialogHeader>
  );

  assert.equal(hasDialogDescription(children), true);
});

test("permite dialogs sin descripción explícita para resolver aria-describedby en undefined", () => {
  const children = (
    <DialogHeader>
      <DialogTitle>Título sin descripción</DialogTitle>
    </DialogHeader>
  );

  assert.equal(hasDialogDescription(children), false);
});
