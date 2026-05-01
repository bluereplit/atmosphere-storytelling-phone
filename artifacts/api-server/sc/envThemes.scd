// Environment Theme SynthDefs
// Each theme accepts: amp, intensity, phaseOffset, fadeTime, gate
// intensity (0-1) morphs the sound from calm to energetic
// All themes use continuous synthesis - no samples

(
// Helper: smooth intensity control with lag
~makeIntensityCtrl = { |intensityBus, lagTime=2.0|
    Lag.kr(intensityBus.asControlInput, lagTime)
};

// --- FOREST ---
SynthDef(\env_forest, { |amp=1.0, intensity=0.3, phaseOffset=0.0, fadeTime=3.0, gate=1|
    var env, sig, drone, leaves, water, depth;
    env = Linen.kr(gate, fadeTime, 1.0, fadeTime, 2);
    var intLag = Lag.kr(intensity, 2.0);

    // Root drone: warm organic tone in A
    drone = Mix.new([
        SinOsc.ar(55 * (1 + (phaseOffset * 0.02)), 0, 0.15),
        SinOsc.ar(110, 0, 0.1 * (1 - intLag * 0.3)),
        SinOsc.ar(164.81, LFNoise1.kr(0.1).range(0, 2pi), 0.05 * intLag),
    ]);
    drone = drone * LFNoise1.kr(0.05).range(0.7, 1.0);

    // Rustling leaves: filtered noise with slow LFO
    leaves = {
        var freq = LFNoise1.kr(0.08 + (intLag * 0.2)).exprange(800, 3000);
        BPF.ar(PinkNoise.ar(0.3), freq, 0.3)
    }.dup(2);
    leaves = leaves * LFNoise1.kr(0.12).range(0.3, 0.9);
    leaves = leaves * Lag.kr(intLag, 1.0).linlin(0, 1, 0.3, 0.8);

    // Distant water: band-passed brown noise
    water = BPF.ar(BrownNoise.ar(0.2), 600 + (intLag * 400), 0.15);
    water = water * LFNoise1.kr(0.04).range(0.4, 0.9);

    // Depth reverb
    depth = drone + leaves[0] + water;
    depth = FreeVerb.ar(depth, 0.4, 0.6, 0.5);

    sig = [depth + leaves[1], depth + leaves[0]] * 0.4;
    sig = sig * env * Lag.kr(amp, fadeTime);
    Out.ar(0, sig);
}).add;


// --- OCEAN ---
SynthDef(\env_ocean, { |amp=1.0, intensity=0.3, phaseOffset=0.0, fadeTime=3.0, gate=1|
    var env, sig, wave, drone, spray;
    env = Linen.kr(gate, fadeTime, 1.0, fadeTime, 2);
    var intLag = Lag.kr(intensity, 2.0);

    // Open fifth harmonic bed: E and B
    drone = Mix.new([
        SinOsc.ar(41.2, 0, 0.2),
        SinOsc.ar(61.7, 0, 0.15),
        SinOsc.ar(82.4, LFNoise2.kr(0.05), 0.08 * intLag),
    ]);

    // Wave texture: slow sinusoidal amplitude on noise
    wave = PinkNoise.ar(0.5) * LFNoise1.kr(0.15 + (intLag * 0.3)).range(0.0, 1.0);
    wave = LPF.ar(wave, 800 + (intLag * 600));
    wave = wave * 0.6;

    // Sea spray: high-frequency whisper
    spray = HPF.ar(WhiteNoise.ar(0.08 * intLag), 3000);
    spray = spray * LFNoise1.kr(0.3).range(0.1, 0.7);

    sig = FreeVerb.ar(drone + wave + spray, 0.5, 0.8, 0.4);
    sig = [sig, sig] * 0.45;
    sig = sig * env * Lag.kr(amp, fadeTime);
    Out.ar(0, sig);
}).add;


// --- MOUNTAIN ---
SynthDef(\env_mountain, { |amp=1.0, intensity=0.3, phaseOffset=0.0, fadeTime=3.0, gate=1|
    var env, sig, drone, wind, sparse;
    env = Linen.kr(gate, fadeTime, 1.0, fadeTime, 2);
    var intLag = Lag.kr(intensity, 2.0);

    // Thin high-altitude drone: fifths very high
    drone = Mix.new([
        SinOsc.ar(220 * (1 + (phaseOffset * 0.01)), 0, 0.08),
        SinOsc.ar(330, 0, 0.05),
        SinOsc.ar(440, 0, 0.03 * intLag),
    ]);
    drone = drone * LFNoise1.kr(0.03).range(0.6, 1.0);

    // Thin wind
    wind = BPF.ar(PinkNoise.ar(0.25), 1200 + (intLag * 800), 0.5);
    wind = wind * LFNoise1.kr(0.07 + (intLag * 0.2)).range(0.0, 1.0);

    // Sparse tonal events
    sparse = SinOsc.ar(
        LFNoise0.kr(0.04 + intLag * 0.5).exprange(440, 1760),
        0,
        LFNoise1.kr(0.5).range(0, 0.05 * intLag)
    );

    sig = FreeVerb.ar(drone + wind + sparse, 0.6, 0.9, 0.3);
    sig = [sig, sig] * 0.4;
    sig = sig * env * Lag.kr(amp, fadeTime);
    Out.ar(0, sig);
}).add;


// --- DESERT ---
SynthDef(\env_desert, { |amp=1.0, intensity=0.3, phaseOffset=0.0, fadeTime=3.0, gate=1|
    var env, sig, sub, staticNoise, heat;
    env = Linen.kr(gate, fadeTime, 1.0, fadeTime, 2);
    var intLag = Lag.kr(intensity, 2.0);

    // Vast sub drone
    sub = SinOsc.ar(28 + (phaseOffset * 2), 0, 0.25);
    sub = sub * LFNoise1.kr(0.02).range(0.5, 1.0);

    // Dry static
    staticNoise = LPF.ar(PinkNoise.ar(0.15), 300 + (intLag * 200));

    // Heat shimmer: very slow pitch-shifting sine
    heat = Mix.new([
        SinOsc.ar(SinOsc.kr(0.03).range(65, 67), 0, 0.06),
        SinOsc.ar(SinOsc.kr(0.017).range(98, 100), 0, 0.04),
    ]);
    heat = heat * (1 + intLag * 0.5);

    sig = sub + staticNoise + heat;
    sig = FreeVerb.ar(sig, 0.2, 0.5, 0.6);
    sig = [sig, sig] * 0.4;
    sig = sig * env * Lag.kr(amp, fadeTime);
    Out.ar(0, sig);
}).add;


// --- CITY ---
SynthDef(\env_city, { |amp=1.0, intensity=0.3, phaseOffset=0.0, fadeTime=3.0, gate=1|
    var env, sig, hum, rumble, crowd;
    env = Linen.kr(gate, fadeTime, 1.0, fadeTime, 2);
    var intLag = Lag.kr(intensity, 2.0);

    // Urban electrical hum: 60Hz and harmonics
    hum = Mix.new([
        SinOsc.ar(60, 0, 0.12),
        SinOsc.ar(120, 0, 0.05),
        SinOsc.ar(180, 0, 0.02),
    ]);
    hum = hum * LFNoise1.kr(0.1).range(0.7, 1.0);

    // Traffic sub-rumble
    rumble = LPF.ar(BrownNoise.ar(0.3), 150 + (intLag * 200));
    rumble = rumble * LFNoise1.kr(0.08).range(0.4, 1.0);
    rumble = rumble * (0.3 + intLag * 0.5);

    // Distant crowd texture
    crowd = BPF.ar(PinkNoise.ar(0.15), 600, 0.5);
    crowd = crowd * LFNoise1.kr(0.15 + intLag * 0.3).range(0.0, 0.6 * intLag);

    sig = FreeVerb.ar(hum + rumble + crowd, 0.3, 0.5, 0.5);
    sig = [sig, sig] * 0.45;
    sig = sig * env * Lag.kr(amp, fadeTime);
    Out.ar(0, sig);
}).add;


// --- MYSTICAL ---
SynthDef(\env_mystical, { |amp=1.0, intensity=0.3, phaseOffset=0.0, fadeTime=3.0, gate=1|
    var env, sig, drone, bells, shimmer;
    env = Linen.kr(gate, fadeTime, 1.0, fadeTime, 2);
    var intLag = Lag.kr(intensity, 2.0);

    // Modal drone: Dorian-flavored slow movement
    drone = Mix.new([
        SinOsc.ar(73.4 * (1 + (phaseOffset * 0.01)), LFNoise1.kr(0.03), 0.18),
        SinOsc.ar(110, 0, 0.10),
        SinOsc.ar(146.8, 0, 0.06),
        SinOsc.ar(196, 0, 0.04 * intLag),
    ]);
    drone = drone * LFNoise1.kr(0.04).range(0.6, 1.0);

    // Bell overtones: sporadic ringing
    bells = Mix.fill(3, { |i|
        SinOsc.ar(
            [293.7, 440, 659] !! i,
            0,
            Decay.ar(Dust.ar(0.15 + intLag * 0.3), 2.0, 0.04)
        )
    });

    // Ethereal shimmer: slow chorus
    shimmer = Mix.new([
        SinOsc.ar(220.5, LFNoise1.kr(0.08), 0.05 * intLag),
        SinOsc.ar(219.5, LFNoise1.kr(0.06), 0.05 * intLag),
    ]);

    sig = FreeVerb.ar(drone + bells + shimmer, 0.7, 0.9, 0.3);
    sig = [sig, sig] * 0.4;
    sig = sig * env * Lag.kr(amp, fadeTime);
    Out.ar(0, sig);
}).add;


// --- MEDIEVAL ---
SynthDef(\env_medieval, { |amp=1.0, intensity=0.3, phaseOffset=0.0, fadeTime=3.0, gate=1|
    var env, sig, drone, perc;
    env = Linen.kr(gate, fadeTime, 1.0, fadeTime, 2);
    var intLag = Lag.kr(intensity, 2.0);

    // Open fifth drone: D and A
    drone = Mix.new([
        SinOsc.ar(73.4, 0, 0.2),
        SinOsc.ar(110, 0, 0.15),
        SinOsc.ar(146.8, 0, 0.08),
        Saw.ar(36.7, 0.04),
    ]);
    drone = RLPF.ar(drone, 600, 0.5);
    drone = drone * LFNoise1.kr(0.05).range(0.7, 1.0);

    // Subtle percussion undertone: slow rhythmic pulse
    perc = SinOsc.ar(55, 0,
        Decay.ar(Impulse.ar(intLag.linlin(0, 1, 0.5, 1.5)), 0.3, 0.08 * intLag)
    );

    sig = FreeVerb.ar(drone + perc, 0.5, 0.7, 0.4);
    sig = [sig, sig] * 0.45;
    sig = sig * env * Lag.kr(amp, fadeTime);
    Out.ar(0, sig);
}).add;


// --- UNDERWATER ---
SynthDef(\env_underwater, { |amp=1.0, intensity=0.3, phaseOffset=0.0, fadeTime=3.0, gate=1|
    var env, sig, pressure, whomp, whale;
    env = Linen.kr(gate, fadeTime, 1.0, fadeTime, 2);
    var intLag = Lag.kr(intensity, 2.0);

    // Deep pressure resonance
    pressure = Mix.new([
        SinOsc.ar(30 + (phaseOffset * 3), 0, 0.25),
        SinOsc.ar(45, 0, 0.12),
        SinOsc.ar(60, 0, 0.07),
    ]);
    pressure = pressure * LFNoise1.kr(0.04).range(0.6, 1.0);

    // Shifting filter sweep
    whomp = RLPF.ar(PinkNoise.ar(0.3),
        SinOsc.kr(0.05 + intLag * 0.1).exprange(80, 400), 0.3);
    whomp = whomp * 0.5;

    // Whale-song harmonics: slow glissando
    whale = SinOsc.ar(
        SinOsc.kr(0.04).exprange(55, 110),
        0,
        0.08 * intLag * LFNoise1.kr(0.06).range(0.0, 1.0)
    );

    sig = FreeVerb.ar(pressure + whomp + whale, 0.6, 0.95, 0.2);
    sig = [sig, sig] * 0.45;
    sig = sig * env * Lag.kr(amp, fadeTime);
    Out.ar(0, sig);
}).add;


// --- COSMIC ---
SynthDef(\env_cosmic, { |amp=1.0, intensity=0.3, phaseOffset=0.0, fadeTime=3.0, gate=1|
    var env, sig, pad, radiation, sparse;
    env = Linen.kr(gate, fadeTime, 1.0, fadeTime, 2);
    var intLag = Lag.kr(intensity, 2.0);

    // Infinite dark pad: detuned sines
    pad = Mix.fill(6, { |i|
        SinOsc.ar(
            (i + 1) * 27.5 * (1 + LFNoise1.kr(0.01 + (i * 0.003)).range(-0.002, 0.002)),
            0,
            0.06 / (i + 1)
        )
    });
    pad = pad * LFNoise1.kr(0.02).range(0.5, 1.0);

    // Radiation noise texture
    radiation = HPF.ar(LPF.ar(PinkNoise.ar(0.1 * intLag), 200), 40);

    // Sparse high tones
    sparse = Mix.fill(2, {
        SinOsc.ar(
            LFNoise0.kr(0.02).exprange(2000, 8000),
            0,
            Decay.ar(Dust.ar(0.05 + intLag * 0.1), 3.0, 0.02 * intLag)
        )
    });

    sig = FreeVerb.ar(pad + radiation + sparse, 0.8, 1.0, 0.1);
    sig = [sig, sig] * 0.4;
    sig = sig * env * Lag.kr(amp, fadeTime);
    Out.ar(0, sig);
}).add;


// --- CAVE ---
SynthDef(\env_cave, { |amp=1.0, intensity=0.3, phaseOffset=0.0, fadeTime=3.0, gate=1|
    var env, sig, sub, echo, drip;
    env = Linen.kr(gate, fadeTime, 1.0, fadeTime, 2);
    var intLag = Lag.kr(intensity, 2.0);

    // Deep sub rumble
    sub = LPF.ar(BrownNoise.ar(0.35), 80 + (phaseOffset * 20));
    sub = sub * LFNoise1.kr(0.03).range(0.4, 1.0);

    // Resonant echo chamber
    echo = CombC.ar(sub * 0.3, 0.5, 0.3 + (intLag * 0.2), 4.0);

    // Drip rhythm: sparse transients
    drip = SinOsc.ar(
        600 + (LFNoise0.kr(0.3) * 200),
        0,
        Decay.ar(Dust.ar(0.4 + intLag * 0.6), 0.5, 0.06)
    );
    drip = FreeVerb.ar(drip, 0.9, 0.99, 0.1) * 0.5;

    sig = GVerb.ar(sub + echo + drip, 100, 8.0, 0.5);
    sig = sig.dup * 0.4;
    sig = sig * env * Lag.kr(amp, fadeTime);
    Out.ar(0, sig);
}).add;


// --- ARCTIC ---
SynthDef(\env_arctic, { |amp=1.0, intensity=0.3, phaseOffset=0.0, fadeTime=3.0, gate=1|
    var env, sig, ice, wind, silence;
    env = Linen.kr(gate, fadeTime, 1.0, fadeTime, 2);
    var intLag = Lag.kr(intensity, 2.0);

    // Thin icy string texture
    ice = Mix.fill(4, { |i|
        SinOsc.ar(
            880 * (i + 1) * (1 + LFNoise1.kr(0.03 + i * 0.01).range(-0.001, 0.001)),
            0,
            0.04 / (i + 1)
        )
    });
    ice = ice * LFNoise1.kr(0.06).range(0.0, 1.0);

    // Wind harmonics
    wind = BPF.ar(PinkNoise.ar(0.2), 1800 + (intLag * 1000), 0.4);
    wind = wind * LFNoise1.kr(0.12 + intLag * 0.3).range(0.0, 1.0);

    // Vast silence between events
    silence = SinOsc.ar(28 + (phaseOffset * 2), 0, 0.08);

    sig = FreeVerb.ar(ice + wind + silence, 0.7, 0.98, 0.15);
    sig = [sig, sig] * 0.4;
    sig = sig * env * Lag.kr(amp, fadeTime);
    Out.ar(0, sig);
}).add;


// --- JUNGLE ---
SynthDef(\env_jungle, { |amp=1.0, intensity=0.3, phaseOffset=0.0, fadeTime=3.0, gate=1|
    var env, sig, insectBed, reverb, birdCalls;
    env = Linen.kr(gate, fadeTime, 1.0, fadeTime, 2);
    var intLag = Lag.kr(intensity, 2.0);

    // Dense insect hum: layered band-pass noise
    insectBed = Mix.fill(4, { |i|
        BPF.ar(
            PinkNoise.ar(0.2),
            LFNoise1.kr(0.04 + i * 0.01).exprange(2000 + (i * 500), 4000 + (i * 600)),
            0.15
        )
    });
    insectBed = insectBed * (0.5 + intLag * 0.5);

    // Stochastic exotic bird calls
    birdCalls = Mix.fill(3, {
        SinOsc.ar(
            LFNoise0.kr(intLag * 0.5 + 0.2).exprange(1000, 4000),
            0,
            Decay.ar(Dust.ar(intLag * 0.8 + 0.2), 0.15, 0.05 * intLag)
        )
    });

    // Wet reverb: deep jungle
    reverb = GVerb.ar(insectBed + birdCalls, 50, 4.0, 0.7);

    sig = reverb.dup * 0.4;
    sig = sig * env * Lag.kr(amp, fadeTime);
    Out.ar(0, sig);
}).add;


// --- TAVERN ---
SynthDef(\env_tavern, { |amp=1.0, intensity=0.3, phaseOffset=0.0, fadeTime=3.0, gate=1|
    var env, sig, hum, crowd, fire, rhythm;
    env = Linen.kr(gate, fadeTime, 1.0, fadeTime, 2);
    var intLag = Lag.kr(intensity, 2.0);

    // Warm low-end hum: fundamental of a G
    hum = Mix.new([
        SinOsc.ar(49, 0, 0.18),
        SinOsc.ar(98, 0, 0.08),
        Saw.ar(49, 0.04),
    ]);
    hum = RLPF.ar(hum, 400, 0.6);
    hum = hum * LFNoise1.kr(0.08).range(0.6, 1.0);

    // Crowd murmur
    crowd = BPF.ar(PinkNoise.ar(0.25), 700, 0.6);
    crowd = crowd * LFNoise1.kr(0.18 + intLag * 0.3).range(0.2, 0.8);
    crowd = crowd * intLag;

    // Fire crackle bed
    fire = LPF.ar(BrownNoise.ar(0.15), 300);
    fire = fire * LFNoise1.kr(0.5).range(0.3, 1.0);

    // Rhythmic pulse like a heartbeat of the room
    rhythm = SinOsc.ar(98, 0,
        Decay.ar(Impulse.ar(1.5 + intLag), 0.08, 0.05 * intLag)
    );

    sig = FreeVerb.ar(hum + crowd + fire + rhythm, 0.4, 0.6, 0.5);
    sig = [sig, sig] * 0.45;
    sig = sig * env * Lag.kr(amp, fadeTime);
    Out.ar(0, sig);
}).add;

"Environment themes loaded".postln;
)
