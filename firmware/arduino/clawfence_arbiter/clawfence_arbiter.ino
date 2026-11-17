/*
 * ClawFence arbiter — M5Stack CoreS3 reference sketch
 *
 * Polls the ClawFence arbiter daemon over Wi-Fi, shows the oldest pending
 * request, and resolves it with the two side buttons:
 *
 *   BtnA (left)  -> DENY
 *   BtnB (right) -> APPROVE ONCE
 *
 * This is a reference for the on-site port. It has NOT been flashed to real
 * hardware as part of the repo; verify pin/API details on the board you get.
 *
 * Libraries (Arduino Library Manager):
 *   M5Unified (M5Stack)
 *   ArduinoJson (Benoit Blanchon)
 *
 * Board: M5Stack CoreS3 (ESP32-S3). For Cardputer-Adv, replace M5Unified
 * button calls with the keyboard API from M5Cardputer and keep the HTTP/JSON
 * half unchanged.
 */

#include <M5Unified.h>
#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>

// ---- configure ----
const char* WIFI_SSID = "YOUR_SSID";
const char* WIFI_PASS = "YOUR_PASS";
const char* ARBITER_BASE = "http://192.168.1.10:8791"; // Mac/phone LAN IP
const char* ARBITER_TOKEN = "";                         // optional bearer token
// -------------------

struct PendingCard {
  String id;
  String code;
  String tool;
  String display;
  String intent;
  String expiresAt;
  bool valid = false;
};

PendingCard card;
unsigned long lastPoll = 0;
const unsigned long POLL_MS = 1000;

void drawIdle() {
  M5.Display.fillScreen(TFT_BLACK);
  M5.Display.setTextColor(TFT_GREEN, TFT_BLACK);
  M5.Display.setTextSize(2);
  M5.Display.setCursor(12, 24);
  M5.Display.println("CLAWFENCE");
  M5.Display.setTextColor(TFT_DARKGREY, TFT_BLACK);
  M5.Display.setTextSize(1);
  M5.Display.setCursor(12, 70);
  M5.Display.println("No approvals pending.");
  M5.Display.setCursor(12, 100);
  M5.Display.println("The agent is inside its fence.");
}

void drawCard() {
  M5.Display.fillScreen(TFT_BLACK);
  bool critical = card.code.startsWith("SECRET") || card.code.startsWith("UNAPPROVED") ||
                  card.code.startsWith("OUT_OF_SCOPE") || card.code.startsWith("PRIVILEGE");
  M5.Display.fillRect(0, 0, 320, 34, critical ? TFT_RED : TFT_ORANGE);
  M5.Display.setTextColor(TFT_WHITE, critical ? TFT_RED : TFT_ORANGE);
  M5.Display.setTextSize(1);
  M5.Display.setCursor(8, 10);
  M5.Display.println(card.code + "  ·  " + card.tool);

  M5.Display.setTextColor(TFT_WHITE, TFT_BLACK);
  M5.Display.setTextSize(1);
  M5.Display.setCursor(8, 44);
  M5.Display.println("TASK");
  M5.Display.setTextColor(TFT_LIGHTGREY, TFT_BLACK);
  M5.Display.setCursor(8, 58);
  M5.Display.println(card.intent.substring(0, 60));
  M5.Display.setCursor(8, 74);
  M5.Display.println(card.intent.substring(60, 120));

  M5.Display.setTextColor(TFT_WHITE, TFT_BLACK);
  M5.Display.setCursor(8, 104);
  M5.Display.println("ACTION");
  M5.Display.setTextColor(TFT_YELLOW, TFT_BLACK);
  M5.Display.setCursor(8, 118);
  M5.Display.println(card.display.substring(0, 72));
  M5.Display.setCursor(8, 134);
  M5.Display.println(card.display.substring(72, 144));

  M5.Display.setTextColor(TFT_GREEN, TFT_BLACK);
  M5.Display.setCursor(8, 190);
  M5.Display.println("[B] APPROVE ONCE");
  M5.Display.setTextColor(TFT_RED, TFT_BLACK);
  M5.Display.setCursor(8, 210);
  M5.Display.println("[A] DENY");
}

void pollPending() {
  if (WiFi.status() != WL_CONNECTED) return;
  HTTPClient http;
  String url = String(ARBITER_BASE) + "/api/device/pending";
  http.begin(url);
  if (ARBITER_TOKEN[0]) http.addHeader("Authorization", String("Bearer ") + ARBITER_TOKEN);
  int code = http.GET();
  if (code != 200) { http.end(); return; }
  String body = http.getString();
  http.end();

  JsonDocument doc;
  if (deserializeJson(doc, body) != DeserializationError::Ok) return;
  int count = doc["count"] | 0;
  if (count <= 0) {
    card.valid = false;
    drawIdle();
    return;
  }
  JsonObject p = doc["pending"][0].as<JsonObject>();
  card.id = String(p["id"] | "");
  card.code = String(p["code"] | "");
  card.tool = String(p["tool"] | "");
  card.display = String(p["action"]["display"] | "");
  card.intent = String(p["intent_goal"] | "");
  card.expiresAt = String(p["expires_at"] | "");
  card.valid = card.id.length() > 0;
  if (card.valid) drawCard();
}

void decide(bool approve) {
  if (!card.valid) return;
  if (WiFi.status() != WL_CONNECTED) return;
  HTTPClient http;
  String url = String(ARBITER_BASE) + "/api/decide";
  http.begin(url);
  http.addHeader("Content-Type", "application/json");
  if (ARBITER_TOKEN[0]) http.addHeader("Authorization", String("Bearer ") + ARBITER_TOKEN);
  JsonDocument doc;
  doc["id"] = card.id;
  doc["decision"] = approve ? "allow-once" : "deny";
  doc["approver"] = "core-s3";
  String payload;
  serializeJson(doc, payload);
  int code = http.POST(payload);
  http.end();
  M5.Display.fillScreen(TFT_BLACK);
  M5.Display.setTextColor(code == 200 ? TFT_GREEN : TFT_RED, TFT_BLACK);
  M5.Display.setTextSize(2);
  M5.Display.setCursor(12, 100);
  M5.Display.println(code == 200 ? (approve ? "APPROVED" : "DENIED") : "FAILED");
  delay(900);
  card.valid = false;
  drawIdle();
}

void setup() {
  M5.begin();
  M5.Display.setRotation(1);
  M5.Display.setTextSize(1);
  drawIdle();
  WiFi.begin(WIFI_SSID, WIFI_PASS);
  for (int i = 0; i < 40 && WiFi.status() != WL_CONNECTED; i++) delay(250);
}

void loop() {
  M5.update();
  if (M5.BtnA.wasPressed()) decide(false);
  if (M5.BtnB.wasPressed()) decide(true);
  if (millis() - lastPoll > POLL_MS) {
    lastPoll = millis();
    pollPending();
  }
  delay(10);
}
