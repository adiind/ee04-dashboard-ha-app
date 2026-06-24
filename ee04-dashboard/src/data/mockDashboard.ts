import type { DashboardData } from "../types";

export const mockDashboard: DashboardData = {
  generatedAt: new Date().toISOString(),
  homeAssistantUrl: "http://homeassistant.local:8123",
  entityCount: 334,
  weather: {
    condition: "partly cloudy",
    temperature: 78,
    humidity: 55,
    high: 83,
    low: 67
  },
  room: {
    temperature: 83.0,
    humidity: 54.9,
    source: "ZigTemp",
    presence: "home",
    motion: "still"
  },
  lights: {
    onCount: 3,
    total: 10,
    active: [
      { entityId: "light.hallway_lamp", name: "Hallway Lamp", state: "on" },
      { entityId: "light.desk_lamp", name: "Desk Lamp", state: "on" },
      { entityId: "light.ambient_lamp", name: "Ambient Lamp", state: "on" }
    ]
  },
  printer: {
    state: "idle",
    progress: 0,
    file: "No active job"
  },
  agenda: [
    {
      title: "Studio review",
      calendar: "Northwestern",
      start: new Date(new Date().setHours(10, 30, 0, 0)).toISOString(),
      end: new Date(new Date().setHours(11, 50, 0, 0)).toISOString()
    },
    {
      title: "Product build block",
      calendar: "Canvas",
      start: new Date(new Date().setHours(14, 0, 0, 0)).toISOString(),
      end: new Date(new Date().setHours(16, 0, 0, 0)).toISOString()
    },
    {
      title: "Call home",
      calendar: "Family",
      start: new Date(new Date().setHours(19, 15, 0, 0)).toISOString()
    }
  ],
  transit: [
    { label: "201 North", value: "9 min", detail: "Ridge & Grove" },
    { label: "201 South", value: "14 min", detail: "Ridge & Grove" }
  ],
  alerts: [],
  batteries: {
    count: 6,
    low: [{ entityId: "sensor.wbutton_battery", name: "WButton", state: "35", unit: "%" }],
    lowest: { entityId: "sensor.wbutton_battery", name: "WButton", state: "35", unit: "%" }
  },
  updates: {
    available: []
  },
  availability: {
    unavailableCount: 18,
    unavailable: [
      { entityId: "switch.fan", name: "Fan", state: "unavailable" },
      { entityId: "sensor.none_status", name: "Hephaestus AD5X", state: "unavailable" }
    ]
  },
  security: {
    presence: "home",
    motion: "still",
    activeMotion: [],
    openSensors: [],
    locksUnlocked: [],
    powerProblems: []
  },
  climate: {
    temperatureSensors: [
      { entityId: "sensor.zigtemp_temperature", name: "ZigTemp Temperature", state: "83.0", unit: "°F", deviceClass: "temperature" }
    ],
    humiditySensors: [
      { entityId: "sensor.zigtemp_humidity", name: "ZigTemp Humidity", state: "54.9", unit: "%", deviceClass: "humidity" }
    ],
    climateEntities: [],
    fansActive: []
  },
  media: {
    active: [],
    unavailable: []
  }
};
