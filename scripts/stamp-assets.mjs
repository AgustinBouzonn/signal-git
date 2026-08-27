// Versiona los assets de index.html con un hash de su contenido.
//
// GitHub Pages sirve todo con Cache-Control: max-age=600, incluido index.html.
// Sin versionar, un visitante puede quedarse con el HTML nuevo y el app.js
// viejo todavia en cache: el markup trae controles que ese JS no sabe manejar.
// Con ?v=<hash> el navegador pide el archivo nuevo apenas cambia el contenido.

import fs from "fs/promises";
import path from "path";
import crypto from "crypto";

const SRC = path.resolve("src");
const HTML = path.join(SRC, "index.html");
const ASSETS = ["app.js", "sort.js", "output.css"];

export function hashOf(content) {
  return crypto.createHash("sha1").update(content).digest("hex").slice(0, 8);
}

// Acepta que el asset ya traiga una version previa, para poder correr el script
// varias veces sin acumular parametros. Se trabaja con indices en vez de una
// expresion regular para no depender del escapado del punto en el nombre.
export function stampHtml(html, asset, hash) {
  const abre = '"' + asset;
  const nuevo = '"' + asset + "?v=" + hash + '"';
  const versionValida = /^\?v=[a-f0-9]+$/;

  let salida = "";
  let resto = html;

  while (true) {
    const i = resto.indexOf(abre);
    if (i === -1) break;

    const cierre = resto.indexOf('"', i + 1);
    if (cierre === -1) break;

    // Lo que hay entre el nombre del asset y la comilla de cierre: vacio si no
    // tiene version, "?v=abc123" si ya la tenia, cualquier otra cosa si en
    // realidad es otro archivo cuyo nombre empieza igual (app.js.map).
    const sufijo = resto.slice(i + abre.length, cierre);

    if (sufijo === "" || versionValida.test(sufijo)) {
      salida += resto.slice(0, i) + nuevo;
    } else {
      salida += resto.slice(0, cierre + 1);
    }
    resto = resto.slice(cierre + 1);
  }

  return salida + resto;
}

async function run() {
  let html = await fs.readFile(HTML, "utf-8");
  const aplicados = [];

  for (const asset of ASSETS) {
    let content;
    try {
      content = await fs.readFile(path.join(SRC, asset), "utf-8");
    } catch {
      console.warn("Aviso: " + asset + " no existe todavia, se omite.");
      continue;
    }
    const hash = hashOf(content);
    html = stampHtml(html, asset, hash);
    aplicados.push(asset + "?v=" + hash);
  }

  await fs.writeFile(HTML, html, "utf-8");
  console.log("Assets versionados: " + aplicados.join(", "));
}

// Solo corre cuando se invoca directo, no cuando lo importan los tests.
if (process.argv[1] && process.argv[1].endsWith("stamp-assets.mjs")) {
  run().catch(err => {
    console.error("Fallo el versionado de assets:", err.message);
    process.exit(1);
  });
}
