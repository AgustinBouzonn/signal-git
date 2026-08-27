import test from "node:test";
import assert from "node:assert/strict";
import { hashOf, stampHtml } from "../stamp-assets.mjs";

test("el hash cambia con el contenido y es estable", () => {
  assert.equal(hashOf("a"), hashOf("a"));
  assert.notEqual(hashOf("a"), hashOf("b"));
  assert.match(hashOf("a"), /^[a-f0-9]{8}$/);
});

test("versiona un asset sin version previa", () => {
  const html = '<script src="app.js"></script>';
  assert.equal(stampHtml(html, 'app.js', 'abc12345'), '<script src="app.js?v=abc12345"></script>');
});

test("REGRESION: reemplaza la version previa en vez de acumularla", () => {
  const html = '<script src="app.js?v=deadbeef"></script>';
  const out = stampHtml(html, 'app.js', 'abc12345');
  assert.equal(out, '<script src="app.js?v=abc12345"></script>');
  assert.ok(!out.includes('deadbeef'));
});

test("es idempotente al correrlo dos veces con el mismo hash", () => {
  const html = '<script src="app.js"></script>';
  const una = stampHtml(html, 'app.js', 'abc12345');
  assert.equal(stampHtml(una, 'app.js', 'abc12345'), una);
});

test("versiona todas las apariciones del mismo asset", () => {
  const html = '<link href="output.css"><link href="output.css">';
  const out = stampHtml(html, 'output.css', '11112222');
  assert.equal(out.match(/output\.css\?v=11112222/g).length, 2);
});

test("no toca otros assets ni nombres parecidos", () => {
  const html = '<script src="app.js"></script><script src="sort.js"></script><script src="my-app.js"></script>';
  const out = stampHtml(html, 'app.js', 'abc12345');
  assert.ok(out.includes('"sort.js"'), 'sort.js no debe cambiar');
  assert.ok(out.includes('"my-app.js"'), 'my-app.js no debe confundirse con app.js');
  assert.ok(out.includes('"app.js?v=abc12345"'));
});

test("el punto del nombre no actua como comodin", () => {
  const html = '<script src="appXjs"></script>';
  assert.equal(stampHtml(html, 'app.js', 'abc12345'), html);
});
