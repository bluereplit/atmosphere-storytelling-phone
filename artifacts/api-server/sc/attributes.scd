// Audio Attribute SynthDefs - 38 toggleable sound elements
// Each SynthDef accepts: amp, intensity, fadeTime (and element-specific params)
// amp is faded in/out by Node.js for enable/disable transitions

(

// ===== NATURE — ORIGINAL =====

// Crickets: AM chirp rhythm
SynthDef(\attr_crickets, { |amp=0.0, intensity=0.3, fadeTime=1.0|
    var intLag = Lag.kr(intensity, 1.0);
    var ampLag = Lag.kr(amp, fadeTime);
    var chirpRate = intLag.linlin(0, 1, 8, 20);
    var chirp = SinOsc.ar(4500) * LFPulse.kr(chirpRate, 0, 0.3);
    var sig = BPF.ar(chirp, 4500, 0.3);
    sig = sig * LFNoise1.kr(0.5).range(0.5, 1.0);
    Out.ar(0, (sig.dup * ampLag * 0.3));
}).add;

// Birds: stochastic melodic chirps
SynthDef(\attr_birds, { |amp=0.0, intensity=0.3, fadeTime=1.0|
    var intLag = Lag.kr(intensity, 1.0);
    var ampLag = Lag.kr(amp, fadeTime);
    var rate = intLag.linlin(0, 1, 0.3, 2.0);
    var chirp = Mix.fill(4, { |i|
        SinOsc.ar(
            LFNoise0.kr(rate * 0.5).exprange(800, 3200),
            0,
            Decay.ar(Dust.ar(rate + (i * 0.2)), 0.12, 0.15)
        )
    });
    var sig = FreeVerb.ar(chirp, 0.4, 0.6, 0.5);
    Out.ar(0, (sig.dup * ampLag * 0.4));
}).add;

// Wind: pink noise through resonant LPF
SynthDef(\attr_wind, { |amp=0.0, intensity=0.3, fadeTime=1.0|
    var intLag = Lag.kr(intensity, 1.0);
    var ampLag = Lag.kr(amp, fadeTime);
    var cutoff = intLag.linexp(0, 1, 200, 1200);
    var lfoRate = intLag.linlin(0, 1, 0.05, 0.3);
    var sig = RLPF.ar(PinkNoise.ar(1.0), cutoff * LFNoise1.kr(lfoRate).exprange(0.5, 2.0), 0.5);
    sig = sig * LFNoise1.kr(0.08).range(0.3, 1.0);
    Out.ar(0, ([sig, sig] * ampLag * 0.5));
}).add;

// Owls: sparse hoots with tremolo
SynthDef(\attr_owls, { |amp=0.0, intensity=0.3, fadeTime=1.0|
    var intLag = Lag.kr(intensity, 1.0);
    var ampLag = Lag.kr(amp, fadeTime);
    var rate = intLag.linlin(0, 1, 0.05, 0.25);
    var hoot = SinOsc.ar(
        200 + (SinOsc.kr(5).range(-5, 5)),
        0,
        Decay.ar(Dust.ar(rate), 0.8, 0.5)
    );
    var sig = FreeVerb.ar(hoot, 0.5, 0.7, 0.5);
    Out.ar(0, (sig.dup * ampLag * 0.35));
}).add;

// Campfire: crackling brown noise
SynthDef(\attr_campfire, { |amp=0.0, intensity=0.3, fadeTime=1.0|
    var intLag = Lag.kr(intensity, 1.0);
    var ampLag = Lag.kr(amp, fadeTime);
    var crackle = LPF.ar(BrownNoise.ar(0.5), 600);
    var spike = BPF.ar(WhiteNoise.ar(0.3), 2000, 0.3) * Decay.ar(Dust.ar(8 + (intLag * 15)), 0.05, 1.0);
    var sig = crackle * 0.3 + spike;
    sig = FreeVerb.ar(sig, 0.3, 0.4, 0.6);
    Out.ar(0, (sig.dup * ampLag * 0.45));
}).add;

// Ocean waves: BPF noise with sinusoidal amplitude envelope
SynthDef(\attr_ocean_waves, { |amp=0.0, intensity=0.3, fadeTime=1.0|
    var intLag = Lag.kr(intensity, 1.0);
    var ampLag = Lag.kr(amp, fadeTime);
    var waveRate = intLag.linlin(0, 1, 0.08, 0.25);
    var wave = BPF.ar(PinkNoise.ar(0.8), 400, 0.4);
    wave = wave * SinOsc.kr(waveRate).range(0.0, 1.0);
    var sig = FreeVerb.ar(wave, 0.5, 0.7, 0.3);
    Out.ar(0, (sig.dup * ampLag * 0.55));
}).add;

// Rain: dense white noise through HPF
SynthDef(\attr_rain, { |amp=0.0, intensity=0.3, fadeTime=1.0|
    var intLag = Lag.kr(intensity, 1.0);
    var ampLag = Lag.kr(amp, fadeTime);
    var density = intLag.linlin(0, 1, 0.4, 1.0);
    var rain = HPF.ar(WhiteNoise.ar(density), 1500);
    rain = rain + (BPF.ar(rain, 3000, 0.5) * 0.3);
    Out.ar(0, (rain.dup * ampLag * 0.4));
}).add;

// Thunder: rare burst with pitch sweep
SynthDef(\attr_thunder, { |amp=0.0, intensity=0.3, fadeTime=1.0|
    var intLag = Lag.kr(intensity, 1.0);
    var ampLag = Lag.kr(amp, fadeTime);
    var rate = intLag.linlin(0, 1, 0.02, 0.1);
    var crack = Decay.ar(Dust.ar(rate), 1.5);
    var boom = LPF.ar(BrownNoise.ar(1.0) * crack, 200 + (crack * 500));
    var sig = GVerb.ar(boom, 80, 6.0, 0.5);
    Out.ar(0, (sig.dup * ampLag * 0.6));
}).add;

// Frogs: rhythmic resonant croaking
SynthDef(\attr_frogs, { |amp=0.0, intensity=0.3, fadeTime=1.0|
    var intLag = Lag.kr(intensity, 1.0);
    var ampLag = Lag.kr(amp, fadeTime);
    var rate = intLag.linlin(0, 1, 0.3, 1.5);
    var croak = Mix.fill(3, { |i|
        var freq = [150, 180, 210] !! i;
        Resonz.ar(
            BrownNoise.ar(1.0),
            freq,
            0.01,
            Decay.ar(Dust.ar(rate + (i * 0.3)), 0.25, 0.3)
        )
    });
    Out.ar(0, (croak.dup * ampLag * 0.4));
}).add;

// Stream: bubbling band-passed pink noise
SynthDef(\attr_stream, { |amp=0.0, intensity=0.3, fadeTime=1.0|
    var intLag = Lag.kr(intensity, 1.0);
    var ampLag = Lag.kr(amp, fadeTime);
    var sig = BPF.ar(PinkNoise.ar(0.6), LFNoise1.kr(4.0).exprange(500, 2000), 0.2);
    sig = sig + (BPF.ar(PinkNoise.ar(0.3), LFNoise1.kr(8.0).exprange(1000, 4000), 0.15));
    sig = sig * (0.5 + intLag * 0.5);
    Out.ar(0, (sig.dup * ampLag * 0.4));
}).add;


// ===== NATURE — EXTENDED =====

// Wolves: howling with amplitude swell
SynthDef(\attr_wolves, { |amp=0.0, intensity=0.3, fadeTime=1.0|
    var intLag = Lag.kr(intensity, 1.0);
    var ampLag = Lag.kr(amp, fadeTime);
    var rate = intLag.linlin(0, 1, 0.04, 0.15);
    var howl = SinOsc.ar(
        SinOsc.kr(0.3).exprange(150, 420),
        0,
        Decay.ar(Dust.ar(rate), 2.0, 0.5)
    );
    var sig = FreeVerb.ar(howl, 0.6, 0.85, 0.3);
    Out.ar(0, (sig.dup * ampLag * 0.45));
}).add;

// Ravens: harsh noise bursts
SynthDef(\attr_ravens, { |amp=0.0, intensity=0.3, fadeTime=1.0|
    var intLag = Lag.kr(intensity, 1.0);
    var ampLag = Lag.kr(amp, fadeTime);
    var rate = intLag.linlin(0, 1, 0.1, 0.6);
    var caw = BPF.ar(PinkNoise.ar(1.0), 1200, 0.4) * Decay.ar(Dust.ar(rate), 0.3, 0.4);
    var sig = FreeVerb.ar(caw, 0.4, 0.6, 0.5);
    Out.ar(0, (sig.dup * ampLag * 0.4));
}).add;

// Bats: high frequency flutter
SynthDef(\attr_bats, { |amp=0.0, intensity=0.3, fadeTime=1.0|
    var intLag = Lag.kr(intensity, 1.0);
    var ampLag = Lag.kr(amp, fadeTime);
    var flutter = HPF.ar(WhiteNoise.ar(0.4), 6000) * LFPulse.kr(30 + (intLag * 30), 0, 0.4);
    flutter = flutter * LFNoise1.kr(2.0).range(0.2, 1.0);
    Out.ar(0, (flutter.dup * ampLag * 0.25));
}).add;

// Night insects: dense cicada mass
SynthDef(\attr_insects_night, { |amp=0.0, intensity=0.3, fadeTime=1.0|
    var intLag = Lag.kr(intensity, 1.0);
    var ampLag = Lag.kr(amp, fadeTime);
    var mass = Mix.fill(6, { |i|
        var freq = LFNoise1.kr(0.02 + (i * 0.003)).exprange(3000 + (i * 200), 5000 + (i * 300));
        BPF.ar(PinkNoise.ar(0.15), freq, 0.1)
    });
    mass = mass * (0.5 + intLag * 0.5);
    Out.ar(0, (mass.dup * ampLag * 0.45));
}).add;

// Horses: hoof rhythm + whinny
SynthDef(\attr_horses, { |amp=0.0, intensity=0.3, fadeTime=1.0|
    var intLag = Lag.kr(intensity, 1.0);
    var ampLag = Lag.kr(amp, fadeTime);
    var hoofRate = intLag.linlin(0, 1, 1.0, 4.0);
    var hoof = LPF.ar(BrownNoise.ar(0.7), 300) *
        Decay.ar(Impulse.ar(hoofRate), 0.05, 0.5);
    var whinny = SinOsc.ar(
        EnvGen.ar(Env([400, 800, 300], [0.1, 0.2]), Dust.ar(0.1 + intLag * 0.2)),
        0,
        Decay.ar(Dust.ar(0.08 + intLag * 0.15), 0.5, 0.3)
    );
    var sig = FreeVerb.ar(hoof + whinny, 0.3, 0.5, 0.5);
    Out.ar(0, (sig.dup * ampLag * 0.4));
}).add;

// Waterfall: wide-band roaring
SynthDef(\attr_waterfall, { |amp=0.0, intensity=0.3, fadeTime=1.0|
    var intLag = Lag.kr(intensity, 1.0);
    var ampLag = Lag.kr(amp, fadeTime);
    var roar = BrownNoise.ar(0.8);
    roar = HPF.ar(roar, 200 + (intLag * 300));
    roar = roar + (BPF.ar(WhiteNoise.ar(0.3), 3000, 0.5));
    var sig = FreeVerb.ar(roar, 0.5, 0.7, 0.4);
    Out.ar(0, (sig.dup * ampLag * 0.5));
}).add;

// Blizzard: howling icy wind
SynthDef(\attr_blizzard, { |amp=0.0, intensity=0.3, fadeTime=1.0|
    var intLag = Lag.kr(intensity, 1.0);
    var ampLag = Lag.kr(amp, fadeTime);
    var howl = RLPF.ar(PinkNoise.ar(0.8), LFNoise1.kr(0.15 + intLag * 0.4).exprange(300, 2000), 0.3);
    var ice = HPF.ar(WhiteNoise.ar(0.2 * intLag), 5000);
    var sig = howl + ice;
    sig = sig * LFNoise1.kr(0.2).range(0.4, 1.0);
    Out.ar(0, (sig.dup * ampLag * 0.55));
}).add;

// Sandstorm: gritty dense noise
SynthDef(\attr_sandstorm, { |amp=0.0, intensity=0.3, fadeTime=1.0|
    var intLag = Lag.kr(intensity, 1.0);
    var ampLag = Lag.kr(amp, fadeTime);
    var grit = BPF.ar(WhiteNoise.ar(0.7), 1500 + (intLag * 500), 0.5);
    grit = grit + LPF.ar(BrownNoise.ar(0.4), 400);
    grit = grit * LFNoise1.kr(0.25 + intLag * 0.5).range(0.4, 1.0);
    Out.ar(0, (grit.dup * ampLag * 0.5));
}).add;

// Geothermal: bubbling, hissing steam
SynthDef(\attr_geothermal, { |amp=0.0, intensity=0.3, fadeTime=1.0|
    var intLag = Lag.kr(intensity, 1.0);
    var ampLag = Lag.kr(amp, fadeTime);
    var bubble = Resonz.ar(BrownNoise.ar(0.6), 60 + (intLag * 40), 0.05);
    bubble = bubble * LFNoise1.kr(2.0).range(0.0, 1.0);
    var steam = HPF.ar(WhiteNoise.ar(0.3 * intLag), 2000) *
        LFNoise1.kr(0.3 + intLag).range(0.0, 1.0);
    Out.ar(0, ((bubble + steam).dup * ampLag * 0.4));
}).add;


// ===== CITY / URBAN =====

// Traffic: distant car hum + horn
SynthDef(\attr_traffic, { |amp=0.0, intensity=0.3, fadeTime=1.0|
    var intLag = Lag.kr(intensity, 1.0);
    var ampLag = Lag.kr(amp, fadeTime);
    var hum = LPF.ar(PinkNoise.ar(0.5), 150 + (intLag * 200));
    hum = hum * LFNoise1.kr(0.1).range(0.4, 1.0);
    var horn = SinOsc.ar(400, 0,
        Decay.ar(Dust.ar(0.05 + intLag * 0.15), 0.3, 0.2 * intLag)
    );
    Out.ar(0, ((hum + horn).dup * ampLag * 0.45));
}).add;

// Crowd: layered breath voices
SynthDef(\attr_crowd, { |amp=0.0, intensity=0.3, fadeTime=1.0|
    var intLag = Lag.kr(intensity, 1.0);
    var ampLag = Lag.kr(amp, fadeTime);
    var voices = Mix.fill(8, { |i|
        BPF.ar(
            PinkNoise.ar(0.1),
            LFNoise1.kr(0.1 + i * 0.02).exprange(200, 1000),
            0.3
        ) * LFNoise1.kr(0.2 + i * 0.03).range(0.0, 1.0)
    });
    voices = voices * (0.3 + intLag * 0.7);
    var sig = FreeVerb.ar(voices, 0.4, 0.5, 0.5);
    Out.ar(0, (sig.dup * ampLag * 0.4));
}).add;

// Subway: low mechanical rumble
SynthDef(\attr_subway, { |amp=0.0, intensity=0.3, fadeTime=1.0|
    var intLag = Lag.kr(intensity, 1.0);
    var ampLag = Lag.kr(amp, fadeTime);
    var rumble = LPF.ar(BrownNoise.ar(0.7), 100 + (intLag * 50));
    rumble = rumble * LFNoise1.kr(0.05).range(0.3, 1.0);
    var squeal = BPF.ar(WhiteNoise.ar(0.15), LFNoise0.kr(0.1).exprange(800, 2000), 0.2) *
        LFNoise1.kr(0.08).range(0.0, intLag * 0.5);
    var sig = FreeVerb.ar(rumble + squeal, 0.4, 0.6, 0.4);
    Out.ar(0, (sig.dup * ampLag * 0.5));
}).add;

// Sirens: oscillating pitch sweep
SynthDef(\attr_sirens, { |amp=0.0, intensity=0.3, fadeTime=1.0|
    var intLag = Lag.kr(intensity, 1.0);
    var ampLag = Lag.kr(amp, fadeTime);
    var rate = intLag.linlin(0, 1, 0.02, 0.08);
    var siren = SinOsc.ar(
        SinOsc.kr(0.7).exprange(700, 1000),
        0,
        0.4 * Decay.ar(Dust.ar(rate), 4.0, 1.0)
    );
    var sig = FreeVerb.ar(siren, 0.2, 0.5, 0.7);
    Out.ar(0, (sig.dup * ampLag * 0.4));
}).add;

// City rain: rain on hard surfaces
SynthDef(\attr_rain_city, { |amp=0.0, intensity=0.3, fadeTime=1.0|
    var intLag = Lag.kr(intensity, 1.0);
    var ampLag = Lag.kr(amp, fadeTime);
    var density = intLag.linlin(0, 1, 0.5, 1.0);
    var rain = HPF.ar(WhiteNoise.ar(density), 3000);
    var percussion = BPF.ar(WhiteNoise.ar(0.3), 5000, 0.3) * Decay.ar(Dust.ar(20 + intLag * 30), 0.01, 1.0);
    Out.ar(0, ((rain + percussion).dup * ampLag * 0.35));
}).add;


// ===== MYSTICAL / ARCANE =====

// Singing bowls: tuned resonant tones
SynthDef(\attr_singing_bowls, { |amp=0.0, intensity=0.3, fadeTime=1.0|
    var intLag = Lag.kr(intensity, 1.0);
    var ampLag = Lag.kr(amp, fadeTime);
    var rate = intLag.linlin(0, 1, 0.05, 0.2);
    var bowl = Mix.fill(3, { |i|
        var freq = [196, 261.6, 329.6] !! i;
        Resonz.ar(
            Decay.ar(Dust.ar(rate + (i * 0.03)), 3.0, 0.4),
            freq,
            0.003
        )
    });
    var sig = FreeVerb.ar(bowl, 0.8, 0.99, 0.15);
    Out.ar(0, (sig.dup * ampLag * 0.5));
}).add;

// Chimes: stochastic high transients
SynthDef(\attr_chimes, { |amp=0.0, intensity=0.3, fadeTime=1.0|
    var intLag = Lag.kr(intensity, 1.0);
    var ampLag = Lag.kr(amp, fadeTime);
    var rate = intLag.linlin(0, 1, 0.2, 1.5);
    var chime = Mix.fill(5, { |i|
        var freq = [1047, 1175, 1319, 1480, 1661] !! i;
        SinOsc.ar(freq, 0, Decay.ar(Dust.ar(rate * (i + 1) * 0.2), 1.5, 0.1 / (i + 1)))
    });
    var sig = FreeVerb.ar(chime, 0.7, 0.95, 0.2);
    Out.ar(0, (sig.dup * ampLag * 0.4));
}).add;

// Whispers: eerie breathy texture
SynthDef(\attr_whispers, { |amp=0.0, intensity=0.3, fadeTime=1.0|
    var intLag = Lag.kr(intensity, 1.0);
    var ampLag = Lag.kr(amp, fadeTime);
    var breath = Mix.fill(4, { |i|
        BPF.ar(PinkNoise.ar(0.1), LFNoise1.kr(0.3 + i * 0.05).exprange(200, 600), 0.4) *
        LFNoise1.kr(0.2 + i * 0.04).range(0.0, 1.0)
    });
    breath = breath * (0.4 + intLag * 0.6);
    Out.ar(0, (breath.dup * ampLag * 0.3));
}).add;

// Choir pad: slow vocal formant harmonics
SynthDef(\attr_choir_pad, { |amp=0.0, intensity=0.3, fadeTime=1.0|
    var intLag = Lag.kr(intensity, 1.0);
    var ampLag = Lag.kr(amp, fadeTime);
    var formants = [730, 1090, 2440];
    var choir = Mix.fill(3, { |i|
        var freq = formants !! i;
        BPF.ar(
            Saw.ar(110 * (1 + (LFNoise1.kr(0.02 + i * 0.003).range(-0.003, 0.003))), 0.1),
            freq,
            0.3
        ) * LFNoise1.kr(0.04).range(0.6, 1.0)
    });
    choir = choir * (0.4 + intLag * 0.6);
    var sig = FreeVerb.ar(choir, 0.7, 0.9, 0.2);
    Out.ar(0, (sig.dup * ampLag * 0.4));
}).add;

// Portal hum: rotating spatial oscillation
SynthDef(\attr_portal_hum, { |amp=0.0, intensity=0.3, fadeTime=1.0|
    var intLag = Lag.kr(intensity, 1.0);
    var ampLag = Lag.kr(amp, fadeTime);
    var freq = intLag.linexp(0, 1, 40, 80);
    var hum = Mix.new([
        SinOsc.ar(freq, 0, 0.3),
        SinOsc.ar(freq * 1.5, 0, 0.15),
        SinOsc.ar(freq * 2.0, 0, 0.08),
    ]);
    var pan = SinOsc.kr(0.15 + intLag * 0.3);
    var sig = Pan2.ar(hum, pan);
    Out.ar(0, (sig * ampLag * 0.45));
}).add;


// ===== DRAMATIC / TENSION =====

// Heartbeat: sub-frequency pulse
SynthDef(\attr_heartbeat, { |amp=0.0, intensity=0.3, fadeTime=1.0, tempo=60|
    var intLag = Lag.kr(intensity, 1.0);
    var ampLag = Lag.kr(amp, fadeTime);
    var bps = Lag.kr(tempo / 60.0, 2.0);
    var beat = SinOsc.ar(40, 0, Decay.ar(Impulse.ar(bps), 0.3, 0.6));
    beat = beat + (SinOsc.ar(60, 0, Decay.ar(TDelay.ar(Impulse.ar(bps), 0.12), 0.15, 0.3)));
    beat = LPF.ar(beat, 120);
    Out.ar(0, (beat.dup * ampLag * 0.6));
}).add;

// War drums: distant rhythmic low percussion
SynthDef(\attr_war_drums, { |amp=0.0, intensity=0.3, fadeTime=1.0, tempo=80, distance=0.5|
    var intLag = Lag.kr(intensity, 1.0);
    var ampLag = Lag.kr(amp, fadeTime);
    var bps = Lag.kr(tempo / 60.0, 2.0);
    var distLag = Lag.kr(distance, 1.0);
    var hit = Decay.ar(Impulse.ar(bps), 0.5 + distLag, 0.8);
    var drum = SinOsc.ar(40 + (distLag * 20).neg, 0, hit);
    drum = LPF.ar(drum, 150);
    drum = FreeVerb.ar(drum, 0.5 + distLag * 0.4, 0.7 + distLag * 0.3, 0.5);
    drum = drum * (1.0 - distLag * 0.7);
    Out.ar(0, (drum.dup * ampLag * 0.55));
}).add;

// Tension drone: dissonant cello-like texture
SynthDef(\attr_tension_drone, { |amp=0.0, intensity=0.3, fadeTime=1.0|
    var intLag = Lag.kr(intensity, 1.0);
    var ampLag = Lag.kr(amp, fadeTime);
    // Minor 2nd interval: C and Db
    var bow1 = Saw.ar(65.4, 0.15);
    var bow2 = Saw.ar(69.3, 0.15);
    var drone = RLPF.ar(bow1 + bow2, 800 + (intLag * 1200), 0.4);
    drone = drone * LFNoise1.kr(0.2 + intLag * 0.5).range(0.5, 1.0);
    drone = drone * (0.5 + intLag * 0.5);
    var sig = FreeVerb.ar(drone, 0.5, 0.7, 0.4);
    Out.ar(0, (sig.dup * ampLag * 0.4));
}).add;

// Distant thunder: rolling sub rumble only
SynthDef(\attr_thunder_distant, { |amp=0.0, intensity=0.3, fadeTime=1.0|
    var intLag = Lag.kr(intensity, 1.0);
    var ampLag = Lag.kr(amp, fadeTime);
    var rate = intLag.linlin(0, 1, 0.05, 0.2);
    var rumble = LPF.ar(BrownNoise.ar(0.7), 80);
    rumble = rumble * Decay.ar(Dust.ar(rate), 4.0, 1.0);
    var sig = GVerb.ar(rumble, 100, 8.0, 0.6);
    Out.ar(0, (sig.dup * ampLag * 0.5));
}).add;


// ===== MEDIEVAL / HISTORICAL =====

// Blacksmith: rhythmic metallic hammering
SynthDef(\attr_blacksmith, { |amp=0.0, intensity=0.3, fadeTime=1.0, tempo=72|
    var intLag = Lag.kr(intensity, 1.0);
    var ampLag = Lag.kr(amp, fadeTime);
    var bps = Lag.kr(tempo / 60.0, 2.0);
    var strike = Decay.ar(Impulse.ar(bps), 0.15, 0.8);
    var clang = Mix.new([
        SinOsc.ar(1200, 0, strike * 0.3),
        SinOsc.ar(2100, 0, strike * 0.2),
        BPF.ar(WhiteNoise.ar(strike), 3000, 0.3),
    ]);
    var sig = GVerb.ar(clang, 30, 2.0, 0.5);
    Out.ar(0, (sig.dup * ampLag * 0.45));
}).add;

// Church bells: slow tuned toll
SynthDef(\attr_church_bells, { |amp=0.0, intensity=0.3, fadeTime=1.0|
    var intLag = Lag.kr(intensity, 1.0);
    var ampLag = Lag.kr(amp, fadeTime);
    var rate = intLag.linlin(0, 1, 0.04, 0.15);
    var toll = Mix.fill(3, { |i|
        var freq = [130.8, 174.6, 196.0] !! i;
        SinOsc.ar(freq, 0, Decay.ar(Dust.ar(rate + (i * 0.02)), 3.0, 0.25 / (i + 1)))
    });
    var sig = GVerb.ar(toll, 80, 6.0, 0.4);
    Out.ar(0, (sig.dup * ampLag * 0.5));
}).add;

// Tavern crowd: warm indoor murmur
SynthDef(\attr_tavern_crowd, { |amp=0.0, intensity=0.3, fadeTime=1.0|
    var intLag = Lag.kr(intensity, 1.0);
    var ampLag = Lag.kr(amp, fadeTime);
    var voices = Mix.fill(10, { |i|
        BPF.ar(
            PinkNoise.ar(0.08),
            LFNoise1.kr(0.08 + i * 0.015).exprange(150, 600),
            0.35
        ) * LFNoise1.kr(0.15 + i * 0.02).range(0.0, 1.0)
    });
    voices = RLPF.ar(voices, 900, 0.7);
    voices = voices * (0.4 + intLag * 0.6);
    var sig = FreeVerb.ar(voices, 0.5, 0.65, 0.45);
    Out.ar(0, (sig.dup * ampLag * 0.45));
}).add;

"Attribute SynthDefs loaded".postln;
)
