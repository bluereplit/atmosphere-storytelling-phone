/**
 * Tests for localMicRelay — focusing on the pure parseArecordList() parser
 * which is the most likely source of regressions and covers all the real-world
 * arecord -l output formats operators will encounter.
 */

import { describe, expect, it } from "vitest";
import { parseArecordList } from "./localMicRelay.js";

// ---------------------------------------------------------------------------
// parseArecordList
// ---------------------------------------------------------------------------

describe("parseArecordList", () => {
  it("parses a single-word short name", () => {
    const output = `**** List of CAPTURE Hardware Devices ****
card 0: PCH [HDA Intel PCH], device 0: Analog [ALC887-VD Analog]`;
    const devices = parseArecordList(output);
    expect(devices).toHaveLength(1);
    expect(devices[0]).toEqual({
      id: "hw:0,0",
      name: "HDA Intel PCH — ALC887-VD Analog",
    });
  });

  it("parses multi-word short names (e.g. Bluetooth SCO, USB Audio)", () => {
    const output = `**** List of CAPTURE Hardware Devices ****
card 2: Device [Headset Mono], device 0: Bluetooth SCO [Bluetooth SCO]`;
    const devices = parseArecordList(output);
    expect(devices).toHaveLength(1);
    expect(devices[0]).toEqual({
      id: "hw:2,0",
      name: "Headset Mono — Bluetooth SCO",
    });
  });

  it("parses USB audio devices with multi-word labels", () => {
    const output = `**** List of CAPTURE Hardware Devices ****
card 3: H570 [Poly H570], device 0: USB Audio [USB Audio]`;
    const devices = parseArecordList(output);
    expect(devices).toHaveLength(1);
    expect(devices[0]).toEqual({
      id: "hw:3,0",
      name: "Poly H570 — USB Audio",
    });
  });

  it("parses multiple devices from realistic arecord -l output", () => {
    const output = `**** List of CAPTURE Hardware Devices ****
card 0: PCH [HDA Intel PCH], device 0: ALC887-VD Analog [ALC887-VD Analog]
card 0: PCH [HDA Intel PCH], device 2: ALC887-VD Alt Analog [ALC887-VD Alt Analog]
card 2: Device [Headset Mono], device 0: Bluetooth SCO [Bluetooth SCO]
card 3: H570 [Poly H570], device 0: USB Audio [USB Audio]`;
    const devices = parseArecordList(output);
    expect(devices).toHaveLength(4);
    expect(devices[0]!.id).toBe("hw:0,0");
    expect(devices[1]!.id).toBe("hw:0,2");
    expect(devices[2]!.id).toBe("hw:2,0");
    expect(devices[2]!.name).toBe("Headset Mono — Bluetooth SCO");
    expect(devices[3]!.id).toBe("hw:3,0");
  });

  it("skips header lines and other non-device lines", () => {
    const output = `**** List of CAPTURE Hardware Devices ****
card 1: Loopback [Loopback], device 0: Loopback PCM [Loopback PCM]
card 1: Loopback [Loopback], device 1: Loopback PCM [Loopback PCM]`;
    const devices = parseArecordList(output);
    expect(devices).toHaveLength(2);
    expect(devices[0]!.id).toBe("hw:1,0");
    expect(devices[1]!.id).toBe("hw:1,1");
  });

  it("returns empty array for empty output", () => {
    expect(parseArecordList("")).toHaveLength(0);
  });

  it("returns empty array when arecord reports no devices", () => {
    const output = `**** List of CAPTURE Hardware Devices ****
arecord: device_list:272: no soundcards found...`;
    expect(parseArecordList(output)).toHaveLength(0);
  });

  it("trims whitespace from names", () => {
    // Some implementations may have trailing spaces in names
    const output = `card 0: PCH  [HDA Intel PCH ], device 0: Analog  [ALC887-VD Analog ]`;
    const devices = parseArecordList(output);
    expect(devices).toHaveLength(1);
    expect(devices[0]!.name).toBe("HDA Intel PCH — ALC887-VD Analog");
  });

  it("handles high card/device numbers", () => {
    const output = `card 15: HDMI [HDA Intel HDMI], device 7: HDMI 6 [HDMI 6]`;
    const devices = parseArecordList(output);
    expect(devices).toHaveLength(1);
    expect(devices[0]!.id).toBe("hw:15,7");
    expect(devices[0]!.name).toBe("HDA Intel HDMI — HDMI 6");
  });
});
