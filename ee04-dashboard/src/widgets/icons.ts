import {
  Activity,
  AlertTriangle,
  Battery,
  BatteryCharging,
  Bus,
  CalendarDays,
  CheckCircle2,
  CloudSun,
  DoorOpen,
  Droplets,
  Gauge,
  Home,
  LayoutGrid,
  Lightbulb,
  Printer,
  Radio,
  Router,
  Server,
  ShieldCheck,
  Thermometer,
  Users,
  Wifi,
  Wind
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

/**
 * Icon registry. Layout `options.icon` (and similar) fields reference icons
 * by name from this map, so the layout JSON stays serializable.
 */
export const ICONS: Record<string, LucideIcon> = {
  Activity,
  AlertTriangle,
  Battery,
  BatteryCharging,
  Bus,
  CalendarDays,
  CheckCircle2,
  CloudSun,
  DoorOpen,
  Droplets,
  Gauge,
  Home,
  LayoutGrid,
  Lightbulb,
  Printer,
  Radio,
  Router,
  Server,
  ShieldCheck,
  Thermometer,
  Users,
  Wifi,
  Wind
};

export function getIcon(name: string | undefined): LucideIcon | undefined {
  if (!name) return undefined;
  return ICONS[name];
}
