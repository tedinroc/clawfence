/*
 * ClawFence arbiter — M5Stack Cardputer-Adv reference sketch
 *
 * Keyboard: Y / Enter = APPROVE ONCE, N / Del = DENY.
 * Polls the ClawFence arbiter daemon over Wi-Fi.
 *
 * Libraries: M5Cardputer, ArduinoJson.
 * Board: M5Stack Cardputer (esp32:esp32:m5stack_cardputer).
 * Compile-verified; verify the keyboard layout on your unit before flashing.
 */

#include "M5Cardputer.h"
#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>

const char* WIFI_SSID = "YOUR_SSID";
const char* WIFI_PASS = "YOUR_PASS";
const char* ARBITER_BASE = "http://192.168.1.10:8791";
const char* ARBITER_TOKEN = "";

struct PendingCard {
  String id, code, tool, display, intent;
  bool valid = false;
};

PendingCard card;
unsigned long lastPoll = 0;
const unsigned long POLL_MS = 1200;

void drawIdle() {
  M5Cardputer.Display.fillScreen(TFT_BLACK);
  M5Cardputer.Display.setTextColor(TFT_GREEN, TFT_BLACK);
  M5Cardputer.Display.setTextSize(1);
  M5Cardputer.Display.setCursor(8, 12);
  M5Cardputer.Display.println("CLAWFENCE");
  M5Cardputer.Display.setTextColor(TFT_DARKGREY, TFT_BLACK);
  M5Cardputer.Display.setCursor(8, 40);
  M5Cardputer.Display.println("No approvals pending.");
  M5Cardputer.Display.setCursor(8, 56);
  M5Cardputer.Display.println("Agent is inside its fence.");
}

void drawCard() {
  M5Cardputer.Display.fillScreen(TFT_BLACK);
  bool critical = card.code.startsWith("SECRET") || card.code.startsWith("UNAPPROVED") ||
                  card.code.startsWith("OUT_OF_SCOPE") || card.code.startsWith("PRIVILEGE");
  M5Cardputer.Display.fillRect(0, 0, 240, 22, critical ? TFT_RED : TFT_ORANGE);
  M5Cardputer.Display.setTextColor(TFT_WHITE, critical ? TFT_RED : TFT_ORANGE);
  M5Cardputer.Display.setTextSize(1);
  M5Cardputer.Display.setCursor(4, 6);
  M5Cardputer.Display.println(card.code + " " + card.tool);

  M5Cardputer.Display.setTextColor(TFT_WHITE, TFT_BLACK);
  M5Cardputer.Display.setCursor(6, 28);
  M5Cardputer.Display.println("TASK");
  M5Cardputer.Display.setTextColor(TFT_LIGHTGREY, TFT_BLACK);
  M5Cardputer.Display.setCursor(6, 40);
  M5Cardputer.Display.println(card.intent.substring(0, 38));
  M5Cardputer.Display.setCursor(6, 52);
  M5Cardputer.Display.println(card.intent.substring(38, 76));

  M5Cardputer.Display.setTextColor(TFT_WHITE, TFT_BLACK);
  M5Cardputer.Display.setCursor(6, 68);
  M5Cardputer.Display.println("ACTION");
  M5Cardputer.Display.setTextColor(TFT_YELLOW, TFT_BLACK);
  M5Cardputer.Display.setCursor(6, 80);
  M5Cardputer.Display.println(card.display.substring(0, 38));
  M5Cardputer.Display.setCursor(6, 92);
  M5Cardputer.Display.println(card.display.substring(38, 76));

  M5Cardputer.Display.setTextColor(TFT_GREEN, TFT_BLACK);
  M5Cardputer.Display.setCursor(6, 112);
  M5Cardputer.Display.println("Y/Enter approve");
  M5Cardputer.Display.setTextColor(TFT_RED, TFT_BLACK);
  M5Cardputer.Display.setCursor(6, 124);
  M5Cardputer.Display.println("N/Del deny");
}

void pollPending() {
  if (WiFi.status() != WL_CONNECTED) return;
  HTTPClient http;
  http.begin(String(ARBITER_BASE) + "/api/device/pending");
  if (ARBITER_TOKEN[0]) http.addHeader("Authorization", String("Bearer ") + ARBITER_TOKEN);
  int code = http.GET();
  if (code != 200) { http.end(); return; }
  String body = http.getString();
  http.end();
  JsonDocument doc;
  if (deserializeJson(doc, body) != DeserializationError::Ok) return;
  int count = doc["count"] | 0;
  if (count <= 0) {
    if (card.valid) { card.valid = false; drawIdle(); }
    return;
  }
  JsonObject p = doc["pending"][0].as<JsonObject>();
  card.id = String(p["id"] | "");
  card.code = String(p["code"] | "");
  card.tool = String(p["tool"] | "");
  card.display = String(p["action"]["display"] | "");
  card.intent = String(p["intent_goal"] | "");
  card.valid = card.id.length() > 0;
  if (card.valid) drawCard();
}

void decide(bool approve) {
  if (!card.valid || WiFi.status() != WL_CONNECTED) return;
  HTTPClient http;
  http.begin(String(ARBITER_BASE) + "/api/decide");
  http.addHeader("Content-Type", "application/json");
  if (ARBITER_TOKEN[0]) http.addHeader("Authorization", String("Bearer ") + ARBITER_TOKEN);
  JsonDocument doc;
  doc["id"] = card.id;
  doc["decision"] = approve ? "allow-once" : "deny";
  doc["approver"] = "cardputer";
  String payload;
  serializeJson(doc, payload);
  int code = http.POST(payload);
  http.end();
  M5Cardputer.Display.fillScreen(TFT_BLACK);
  M5Cardputer.Display.setTextColor(code == 200 ? TFT_GREEN : TFT_RED, TFT_BLACK);
  M5Cardputer.Display.setTextSize(2);
  M5Cardputer.Display.setCursor(10, 54);
  M5Cardputer.Display.println(code == 200 ? (approve ? "APPROVED" : "DENIED") : "FAILED");
  delay(900);
  card.valid = false;
  drawIdle();
}

void setup() {
  auto cfg = M5.config();
  M5Cardputer.begin(cfg, true);
  M5Cardputer.Display.setRotation(1);
  M5Cardputer.Display.setTextSize(1);
  drawIdle();
  WiFi.begin(WIFI_SSID, WIFI_PASS);
  for (int i = 0; i < 40 && WiFi.status() != WL_CONNECTED; i++) delay(250);
}

void loop() {
  M5Cardputer.update();
  if (M5Cardputer.Keyboard.isChange() && M5Cardputer.Keyboard.isPressed()) {
    auto st = M5Cardputer.Keyboard.keysState();
    for (auto c : st.word) {
      if (c == 'y' || c == 'Y') decide(true);
      if (c == 'n' || c == 'N') decide(false);
    }
    if (st.enter) decide(true);
    if (st.del) decide(false);
  }
  if (millis() - lastPoll > POLL_MS) {
    lastPoll = millis();
    pollPending();
  }
  delay(10);
}
