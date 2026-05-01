// VoiceMix SynthDef — reads audio from the ALSA loopback input bus,
// applies amplitude scaling and reverb send, and outputs to the main stereo bus.
// Requires snd-aloop kernel module loaded before starting SuperCollider.
// See scripts/setup-alsa-loopback.sh
//
// Parameters:
//   amp      - overall output level (0.0–1.0), faded by fadeTime
//   reverb   - reverb wet mix (0.0–1.0)
//   fadeTime - lag time for amp transitions
//   in       - SoundIn bus index (0 = first input channel on selected device)

(

SynthDef(\voiceMix, { |amp=0.0, reverb=0.2, fadeTime=0.5, in=0|
    var ampLag  = Lag.kr(amp, fadeTime);
    var revLag  = Lag.kr(reverb, 0.5);
    var raw     = SoundIn.ar(in);
    var reverbSig = FreeVerb.ar(raw, revLag, 0.75, 0.3);
    var sig     = (raw * (1.0 - revLag)) + (reverbSig * revLag);
    Out.ar(0, (sig.dup * ampLag));
}).add;

)
