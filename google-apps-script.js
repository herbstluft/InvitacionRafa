/**
 * =========================================================================
 * CODIGO PARA GOOGLE APPS SCRIPT
 * =========================================================================
 * Instrucciones:
 * 1. Crea una hoja de cálculo en Google Sheets.
 * 2. Ve al menú superior: Extensiones -> Apps Script.
 * 3. Borra el código existente y pega este archivo por completo.
 * 4. Rellena las constantes TELEGRAM_BOT_TOKEN y TELEGRAM_ADMIN_CHAT_ID con tus credenciales.
 * 5. Haz clic en "Implementar" -> "Nueva implementación".
 * 6. Selecciona el tipo "Aplicación web".
 * 7. En "Quién tiene acceso", cámbialo a "Cualquier persona".
 * 8. Haz clic en "Implementar", autoriza los permisos y copia la "URL de la aplicación web".
 * 9. Pega esa URL abajo en la constante WEB_APP_URL.
 * 10. Selecciona la función 'vincularWebhook' arriba y ejecútala.
 * 11. Guarda esa misma URL como la variable de entorno API_URL en el panel de Netlify.
 */

const TELEGRAM_BOT_TOKEN = "8820447497:AAHEF4LsB8WLtCK9iMWiojj-YbL2y-wUdls";
const TELEGRAM_ADMIN_CHAT_ID = "8803884947";
const WEB_APP_URL = "https://script.google.com/macros/s/AKfycbzMrIRo-1w32iPpm64JhNgU4xCFYrmVzsKfUozAZ-tKbbkIW5OrxylvK7Map3sLtbMmMg/exec";

function vincularWebhook() {
  if (TELEGRAM_BOT_TOKEN === "" || WEB_APP_URL === "") {
    Logger.log("⚠️ ERROR: Primero debes configurar tus variables TELEGRAM_BOT_TOKEN y WEB_APP_URL al inicio de este script.");
    return;
  }

  const url = "https://api.telegram.org/bot" + TELEGRAM_BOT_TOKEN + "/setWebhook?url=" + encodeURIComponent(WEB_APP_URL);
  const response = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
  Logger.log("Respuesta de Telegram: " + response.getContentText());
}
function iniciarHoja() {
  try {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheets()[0];
    // Limpiar hoja si está vacía e insertar cabeceras
    if (sheet.getLastRow() === 0) {
      sheet.appendRow(["Invitado", "Pases Maximos", "Estado", "Pases Confirmados", "Fecha Actualizacion"]);
      sheet.getRange("A1:E1").setFontWeight("bold").setBackground("#d4af37").setFontColor("#000000");
      Logger.log("✅ Hoja inicializada con éxito en la pestaña: " + sheet.getName());
    } else {
      Logger.log("ℹ️ La hoja ya tiene datos o cabeceras creadas en: " + sheet.getName());
    }
  } catch (err) {
    Logger.log("❌ ERROR al conectar con la hoja: " + err.message);
  }
}

function doPost(e) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheets()[0];

  // Asegurar que las columnas tengan nombres en la fila 1 si la hoja está vacía
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(["Invitado", "Pases Maximos", "Estado", "Pases Confirmados", "Fecha Actualizacion"]);
    sheet.getRange("A1:E1").setFontWeight("bold").setBackground("#d4af37").setFontColor("#000000");
  }

  try {
    const postData = JSON.parse(e.postData.contents);

    // 1. Petición entrante desde el Webhook de Telegram (identificada si no hay 'action' especificada)
    if (!postData.action) {
      if (postData.message) {
        handleTelegramMessage(postData.message, sheet);
      }
      return HtmlService.createHtmlOutput("ok");
    }

    // 2. Acción de RSVP desde la página de Netlify
    if (postData.action === "rsvp") {
      const result = handleRsvp(postData.data, sheet);
      return ContentService.createTextOutput(JSON.stringify(result)).setMimeType(ContentService.MimeType.JSON);
    }

    // 3. Registro de invitación generada desde el panel de Admin
    if (postData.action === "create-invite") {
      const result = handleCreateInvite(postData.data, sheet);
      return ContentService.createTextOutput(JSON.stringify(result)).setMimeType(ContentService.MimeType.JSON);
    }

    // 4. Obtener todas las invitaciones
    if (postData.action === "get-invites") {
      const result = handleGetInvites(sheet);
      return ContentService.createTextOutput(JSON.stringify(result)).setMimeType(ContentService.MimeType.JSON);
    }

    // 5. Eliminar invitación
    if (postData.action === "delete-invite") {
      const result = handleDeleteInvite(postData.data, sheet);
      return ContentService.createTextOutput(JSON.stringify(result)).setMimeType(ContentService.MimeType.JSON);
    }

    // 6. Actualizar invitación
    if (postData.action === "update-invite") {
      const result = handleUpdateInvite(postData.data, sheet);
      return ContentService.createTextOutput(JSON.stringify(result)).setMimeType(ContentService.MimeType.JSON);
    }

    return ContentService.createTextOutput(JSON.stringify({ status: "ignored" })).setMimeType(ContentService.MimeType.JSON);

  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({ status: "error", message: error.toString() })).setMimeType(ContentService.MimeType.JSON);
  }
}

function handleCreateInvite(data, sheet) {
  const name = data.name;
  const maxPasses = data.max_passes;

  const dataRange = sheet.getDataRange();
  const values = dataRange.getValues();
  let foundRow = -1;

  // Buscar si el invitado ya existe para sobrescribirlo
  for (let i = 1; i < values.length; i++) {
    if (values[i][0] && values[i][0].toString().toLowerCase() === name.toLowerCase()) {
      foundRow = i + 1;
      break;
    }
  }

  if (foundRow !== -1) {
    sheet.getRange(foundRow, 2).setValue(maxPasses);
    sheet.getRange(foundRow, 3).setValue("Pendiente");
    sheet.getRange(foundRow, 4).setValue(0);
    sheet.getRange(foundRow, 5).setValue(new Date());
  } else {
    // Agregar nueva fila de invitación pendiente
    sheet.appendRow([name, maxPasses, "Pendiente", 0, new Date()]);
  }

  return { status: "success", guest: name, max_passes: maxPasses };
}

function handleRsvp(data, sheet) {
  const name = data.name;
  const confirmed = data.confirmed;
  const passes = data.passes;

  const dataRange = sheet.getDataRange();
  const values = dataRange.getValues();
  let foundRow = -1;

  for (let i = 1; i < values.length; i++) {
    if (values[i][0] && values[i][0].toString().toLowerCase() === name.toLowerCase()) {
      foundRow = i + 1;
      break;
    }
  }

  const statusStr = confirmed ? "Confirmado" : "Declinado";
  const passesVal = confirmed ? passes : 0;

  if (foundRow !== -1) {
    sheet.getRange(foundRow, 3).setValue(statusStr);
    sheet.getRange(foundRow, 4).setValue(passesVal);
    sheet.getRange(foundRow, 5).setValue(new Date());
  } else {
    // Si por alguna razón no estaba preregistrado en el panel, lo agregamos directamente
    sheet.appendRow([name, data.max_passes || passesVal, statusStr, passesVal, new Date()]);
  }

  // Enviar mensaje al administrador por Telegram
  const maxAllowed = foundRow !== -1 ? values[foundRow - 1][1] : (data.max_passes || passesVal);
  let messageText = "";
  if (confirmed) {
    messageText = "🎰 *¡NUEVA CONFIRMACIÓN DE ASISTENCIA!* 🎰\n\n" +
      "👤 *Invitado:* " + name + "\n" +
      "🎟️ *Pases elegidos:* `" + passesVal + " de " + maxAllowed + "`\n\n" +
      "✨ La lista de asistentes en tu Google Sheet ha sido actualizada.";
  } else {
    messageText = "❌ *¡INVITACIÓN DECLINADA!* ❌\n\n" +
      "👤 *Invitado:* " + name + "\n" +
      "💔 Ha cancelado/declinado la asistencia.";
  }

  sendTelegramMessage(messageText);
  return { status: "success", updated: true };
}

function handleTelegramMessage(message, sheet) {
  const chatId = message.chat.id.toString();
  const text = message.text ? message.text.toLowerCase().trim() : "";
  
  if (text.startsWith("/start") || text.includes("ayuda")) {
    const welcome = "🎩 *¡Bienvenido!* 🎩\n\n" +
                    "Desde aquí puedes consultar en tiempo real la lista de invitados para la fiesta de 15 años de Rafa.\n\n" +
                    "📋 *Comandos de Consulta rápidos*:\n" +
                    "🔹 *asistiran* o `/lista` — Lista completa de invitados confirmados.\n" +
                    "🔹 *pendientes* o `/pendientes` — Ver quiénes no han respondido aún.\n" +
                    "🔹 *resumen* o `/resumen` — Resumen numérico y estadísticas generales.";
    sendTelegramMessageTo(chatId, welcome);
    return;
  }
  
  const dataRange = sheet.getDataRange();
  const values = dataRange.getValues();
  
  if (text.includes("asistiran") || text.includes("/lista")) {
    let list = "✅ *Invitados Confirmados*:\n\n";
    let count = 0;
    let totalPasses = 0;
    
    for (let i = 1; i < values.length; i++) {
      if (values[i][2] === "Confirmado") {
        count++;
        const pases = values[i][3];
        totalPasses += pases;
        list += count + ". *" + values[i][0] + "* — `" + pases + " pases`\n";
      }
    }
    
    if (count === 0) {
      list += "_No hay confirmaciones registradas hasta el momento._";
    } else {
      list += "\n🎫 Total de Asistentes: *" + totalPasses + " personas* (" + count + " invitaciones confirmadas)";
    }
    sendTelegramMessageTo(chatId, list);
    
  } else if (text.includes("pendientes") || text.includes("/pendientes")) {
    let list = "⏳ *Invitaciones Pendientes de Respuesta*:\n\n";
    let count = 0;
    
    for (let i = 1; i < values.length; i++) {
      if (values[i][2] === "Pendiente") {
        count++;
        list += count + ". *" + values[i][0] + "* (Autorizado: " + values[i][1] + " pases)\n";
      }
    }
    
    if (count === 0) {
      list += "_¡Excelente! No quedan invitaciones pendientes de respuesta._";
    } else {
      list += "\n⏳ Faltan *" + count + " invitados* por confirmar.";
    }
    sendTelegramMessageTo(chatId, list);
    
  } else if (text.includes("resumen") || text.includes("/resumen")) {
    let confirmedCount = 0;
    let confirmedPasses = 0;
    let pendingCount = 0;
    let declinedCount = 0;
    
    for (let i = 1; i < values.length; i++) {
      const status = values[i][2];
      if (status === "Confirmado") {
        confirmedCount++;
        confirmedPasses += values[i][3];
      } else if (status === "Pendiente") {
        pendingCount++;
      } else if (status === "Declinado") {
        declinedCount++;
      }
    }
    
    const resumen = "📊 *Resumen del Estatus de Invitaciones*:\n\n" +
                    "✅ *Asistirán:* `" + confirmedCount + " invitados (" + confirmedPasses + " pases)`\n" +
                    "⏳ *Pendientes:* `" + pendingCount + " invitados`\n" +
                    "❌ *No Asistirán:* `" + declinedCount + " invitados`\n\n" +
                    "🎰 *Total de pases reservados de Casino Royale:* `" + confirmedPasses + "`";
    sendTelegramMessageTo(chatId, resumen);
    
  } else {
    sendTelegramMessageTo(chatId, "❓ Comando no reconocido. Escribe *asistiran*, *pendientes* o *resumen* para consultarme.");
  }
}

function sendTelegramMessage(text) {
  sendTelegramMessageTo(TELEGRAM_ADMIN_CHAT_ID, text);
}

function sendTelegramMessageTo(chatId, text) {
  const url = "https://api.telegram.org/bot" + TELEGRAM_BOT_TOKEN + "/sendMessage";
  const payload = {
    chat_id: chatId,
    text: text,
    parse_mode: "Markdown"
  };

  const options = {
    method: "post",
    contentType: "application/json",
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  };

  UrlFetchApp.fetch(url, options);
}

function handleGetInvites(sheet) {
  const values = sheet.getDataRange().getValues();
  const invites = [];
  for (let i = 1; i < values.length; i++) {
    if (values[i][0]) {
      invites.push({
        name: values[i][0].toString(),
        max_passes: parseInt(values[i][1], 10) || 1,
        status: values[i][2] || "Pendiente",
        confirmed_passes: parseInt(values[i][3], 10) || 0,
        updated_at: values[i][4] ? values[i][4].toString() : ""
      });
    }
  }
  return { status: "success", invites: invites };
}

function handleDeleteInvite(data, sheet) {
  const name = data.name;
  const values = sheet.getDataRange().getValues();
  let foundRow = -1;
  for (let i = 1; i < values.length; i++) {
    if (values[i][0] && values[i][0].toString().toLowerCase() === name.toLowerCase()) {
      foundRow = i + 1;
      break;
    }
  }
  if (foundRow !== -1) {
    sheet.deleteRow(foundRow);
    return { status: "success", message: "Invitación eliminada" };
  }
  return { status: "error", message: "Invitado no encontrado" };
}

function handleUpdateInvite(data, sheet) {
  const oldName = data.oldName;
  const newName = data.newName;
  const maxPasses = parseInt(data.max_passes, 10);
  const status = data.status || "Pendiente";
  const confirmedPasses = parseInt(data.confirmed_passes, 10) || 0;

  const values = sheet.getDataRange().getValues();
  let foundRow = -1;
  for (let i = 1; i < values.length; i++) {
    if (values[i][0] && values[i][0].toString().toLowerCase() === oldName.toLowerCase()) {
      foundRow = i + 1;
      break;
    }
  }

  if (foundRow !== -1) {
    sheet.getRange(foundRow, 1).setValue(newName);
    sheet.getRange(foundRow, 2).setValue(maxPasses);
    sheet.getRange(foundRow, 3).setValue(status);
    sheet.getRange(foundRow, 4).setValue(confirmedPasses);
    sheet.getRange(foundRow, 5).setValue(new Date());
    return { status: "success", message: "Invitación actualizada" };
  }
  return { status: "error", message: "Invitado no encontrado" };
}
