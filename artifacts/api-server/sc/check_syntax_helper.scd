// check_syntax_helper.scd — Syntax-only check for all production .scd files
//
// Compiles each file using the sclang interpreter WITHOUT booting the audio
// server (no Synth instantiation, no server.waitForBoot).  Any file whose
// source fails to parse causes an immediate non-zero exit.
//
// Called by scripts/check_sc_syntax.sh — do not run this file directly.
//
// Hardware integration testing (audio output, SynthDef loading, amplitude
// measurement) lives in test_all.scd and must be run on the Raspberry Pi.

(
var scDir    = thisProcess.nowExecutingPath.dirname;
var toCheck  = ["startup.scd", "envThemes.scd", "attributes.scd", "voice.scd"];
var passed   = 0;
var failed   = 0;
var failures = List.new;

toCheck.do { |filename|
    var path = scDir +/+ filename;
    var src, compiled;

    if (File.exists(path).not, {
        failed = failed + 1;
        failures.add(filename);
        ("MISSING " ++ filename ++ " (file not found — expected at " ++ path ++ ")").postln;
    }, {
        ("Checking " ++ filename ++ " ...").post;
        src      = File.readAllString(path);
        compiled = thisProcess.interpreter.compile(src);
        if (compiled.notNil, {
            passed = passed + 1;
            " OK".postln;
        }, {
            failed = failed + 1;
            failures.add(filename);
            " SYNTAX ERROR".postln;
        });
    });
};

"".postln;
("Result: " ++ passed ++ " passed, " ++ failed ++ " failed").postln;

if (failed > 0, {
    "Syntax errors in:".postln;
    failures.do { |f| ("  " ++ f).postln };
    1.exit;
}, {
    "All files passed syntax check.".postln;
    0.exit;
});
)
