import React, { useRef, useEffect, useCallback, forwardRef, useImperativeHandle } from 'react';
import { Platform, View } from 'react-native';
import type { AtmosphereState } from '../../types';

export interface AudioEngineHandle {
  sendToEngine: (msg: Record<string, unknown>) => void;
  startWithState: (state: AtmosphereState) => void;
}

interface Props {
  onReady?: () => void;
}

// Web stub — audio runs in WebView on native only
const AudioEngineStub = forwardRef<AudioEngineHandle, Props>(({ onReady }, ref) => {
  useImperativeHandle(ref, () => ({
    sendToEngine: () => {},
    startWithState: () => {},
  }));
  useEffect(() => { onReady?.(); }, []);
  return null;
});
AudioEngineStub.displayName = 'AudioEngineStub';

// We build the HTML inline to avoid Metro bundler issues with .html files
const buildEngineHtml = () => `<!DOCTYPE html>
<html><head><meta charset="utf-8"><style>body{margin:0;background:#000;overflow:hidden;}</style></head>
<body>
<script src="https://cdnjs.cloudflare.com/ajax/libs/tone/14.8.49/Tone.js"></script>
<script>
(function(){
'use strict';
var started=false,masterVolume=0.8,muted=false;
var masterGain,limiter,pitchShift,lpf,reverb,dryBus;
var attribs={};
var enabledAttributes=new Set();
var attributeVolumes={};

function init(){
  masterGain=new Tone.Gain(masterVolume).toDestination();
  limiter=new Tone.Limiter(-3).connect(masterGain);
  pitchShift=new Tone.PitchShift(0).connect(limiter);
  lpf=new Tone.Filter(8000,'lowpass').connect(pitchShift);
  reverb=new Tone.Reverb({decay:4,wet:0.3}).connect(lpf);
  dryBus=new Tone.Gain(1).connect(lpf);
  buildAttribs();
}

function toWet(n){n.connect(reverb);return n;}
function toDry(n){n.connect(dryBus);return n;}
function toBoth(n,w){n.connect(reverb);n.connect(dryBus);return n;}

function makeNoise(type,freq,ftype,wet){
  var g=new Tone.Gain(0),n=new Tone.Noise(type),f=new Tone.Filter(freq,ftype);
  n.connect(f);f.connect(g);wet?toWet(g):toDry(g);
  return{gain:g,start:function(){n.start();},stop:function(){n.stop();},setVolume:function(v){g.gain.rampTo(v,0.5);}};
}

function buildAttribs(){
  // wind
  attribs.wind=(function(){
    var g=new Tone.Gain(0),n=new Tone.Noise('pink'),af=new Tone.AutoFilter({frequency:0.1,octaves:3}).start(),f=new Tone.Filter(2000,'lowpass');
    n.connect(af);af.connect(f);f.connect(g);toBoth(g,0.3);
    return{gain:g,start:function(){n.start();},stop:function(){n.stop();},setVolume:function(v){g.gain.rampTo(v,0.5);}};
  })();
  // rain
  attribs.rain=(function(){
    var g=new Tone.Gain(0),n=new Tone.Noise('white'),hp=new Tone.Filter(800,'highpass'),lp=new Tone.Filter(5000,'lowpass');
    n.connect(hp);hp.connect(lp);lp.connect(g);toWet(g);
    return{gain:g,start:function(){n.start();},stop:function(){n.stop();},setVolume:function(v){g.gain.rampTo(v*0.6,0.5);}};
  })();
  // crickets
  attribs.crickets=(function(){
    var g=new Tone.Gain(0),am=new Tone.AMOscillator({frequency:4200,modulationFrequency:18,type:'sawtooth'}),lp=new Tone.Filter(5500,'lowpass');
    am.connect(lp);lp.connect(g);toDry(g);
    return{gain:g,start:function(){am.start();},stop:function(){am.stop();},setVolume:function(v){g.gain.rampTo(v*0.4,0.5);}};
  })();
  // birds
  attribs.birds=(function(){
    var g=new Tone.Gain(0),synths=[],loop;
    for(var i=0;i<3;i++){var s=new Tone.Synth({oscillator:{type:'sine'},envelope:{attack:0.1,decay:0.2,sustain:0.5,release:0.5}});s.connect(g);synths.push(s);}
    toWet(g);
    var notes=['C5','D5','E5','G5','A5','C6'];
    function trig(){synths.forEach(function(s){if(Math.random()<0.4){try{s.triggerAttackRelease(notes[Math.floor(Math.random()*notes.length)],Math.random()*0.3+0.1);}catch(e){}}}); }
    return{gain:g,start:function(){loop=setInterval(trig,900+Math.random()*1200);},stop:function(){clearInterval(loop);},setVolume:function(v){g.gain.rampTo(v*0.5,0.5);}};
  })();
  // owls
  attribs.owls=(function(){
    var g=new Tone.Gain(0),s=new Tone.Synth({oscillator:{type:'sine'},envelope:{attack:0.3,decay:0.5,sustain:0.6,release:1.5}}),loop;
    s.connect(g);toWet(g);
    function hoot(){try{s.triggerAttackRelease('A3',0.8);}catch(e){}setTimeout(function(){try{s.triggerAttackRelease('G3',1.2);}catch(e){}},900);}
    return{gain:g,start:function(){hoot();loop=setInterval(hoot,7000+Math.random()*8000);},stop:function(){clearInterval(loop);},setVolume:function(v){g.gain.rampTo(v*0.6,0.5);}};
  })();
  // campfire
  attribs.campfire=(function(){
    var g=new Tone.Gain(0),n=new Tone.Noise('brown'),d=new Tone.Distortion(0.3),lp=new Tone.Filter(800,'lowpass'),tr=new Tone.Tremolo({frequency:3,depth:0.4}).start();
    n.connect(d);d.connect(lp);lp.connect(tr);tr.connect(g);toBoth(g,0.15);
    return{gain:g,start:function(){n.start();},stop:function(){n.stop();},setVolume:function(v){g.gain.rampTo(v*0.8,0.5);}};
  })();
  // ocean_waves
  attribs.ocean_waves=(function(){
    var g=new Tone.Gain(0),n=new Tone.Noise('pink'),lfo=new Tone.LFO({frequency:0.07,min:0.1,max:1}),wg=new Tone.Gain(0.5),lp=new Tone.Filter(1200,'lowpass');
    n.connect(lp);lp.connect(wg);lfo.connect(wg.gain);wg.connect(g);lfo.start();toWet(g);
    return{gain:g,start:function(){n.start();},stop:function(){n.stop();},setVolume:function(v){g.gain.rampTo(v*0.9,0.5);}};
  })();
  // thunder
  attribs.thunder=(function(){
    var g=new Tone.Gain(0),n=new Tone.Noise('brown'),env=new Tone.AmplitudeEnvelope({attack:0.01,decay:3,sustain:0,release:2}),loop;
    n.connect(env);env.connect(g);toWet(g);
    function crack(){env.triggerAttackRelease(3);}
    return{gain:g,start:function(){crack();loop=setInterval(crack,10000+Math.random()*15000);},stop:function(){clearInterval(loop);},setVolume:function(v){g.gain.rampTo(v*1.1,0.1);}};
  })();
  // frogs
  attribs.frogs=(function(){
    var g=new Tone.Gain(0),s=new Tone.FMSynth({harmonicity:2,modulationIndex:8,envelope:{attack:0.01,decay:0.1,sustain:0,release:0.2}}),loop;
    s.connect(g);toDry(g);
    var notes=['A2','G2','F2'];
    function croak(){try{s.triggerAttackRelease(notes[Math.floor(Math.random()*notes.length)],0.1);}catch(e){}}
    return{gain:g,start:function(){loop=setInterval(croak,400+Math.random()*600);},stop:function(){clearInterval(loop);},setVolume:function(v){g.gain.rampTo(v*0.5,0.5);}};
  })();
  // stream
  attribs.stream=(function(){
    var g=new Tone.Gain(0),n=new Tone.Noise('white'),bp=new Tone.Filter(1800,'bandpass');
    bp.Q.value=2;n.connect(bp);bp.connect(g);toBoth(g,0.25);
    return{gain:g,start:function(){n.start();},stop:function(){n.stop();},setVolume:function(v){g.gain.rampTo(v*0.55,0.5);}};
  })();
  // wolves
  attribs.wolves=(function(){
    var g=new Tone.Gain(0),s=new Tone.Synth({oscillator:{type:'sawtooth'},envelope:{attack:0.5,decay:0.5,sustain:0.7,release:2}}),loop;
    s.connect(g);toWet(g);
    function howl(){try{s.triggerAttack('A2');setTimeout(function(){try{s.frequency.rampTo('E3',1.5);}catch(e){}},200);setTimeout(function(){try{s.triggerRelease();}catch(e){}},2500);}catch(e){}}
    return{gain:g,start:function(){howl();loop=setInterval(howl,14000+Math.random()*12000);},stop:function(){clearInterval(loop);},setVolume:function(v){g.gain.rampTo(v*0.6,0.5);}};
  })();
  // ravens
  attribs.ravens=(function(){
    var g=new Tone.Gain(0),s=new Tone.Synth({oscillator:{type:'square'},envelope:{attack:0.02,decay:0.2,sustain:0.1,release:0.2}}),loop;
    s.connect(g);toWet(g);
    function caw(){try{s.triggerAttackRelease('C4',0.15);setTimeout(function(){try{s.triggerAttackRelease('A3',0.1);}catch(e){}},200);}catch(e){}}
    return{gain:g,start:function(){loop=setInterval(caw,5000+Math.random()*8000);},stop:function(){clearInterval(loop);},setVolume:function(v){g.gain.rampTo(v*0.4,0.5);}};
  })();
  // bats
  attribs.bats=(function(){
    var g=new Tone.Gain(0),n=new Tone.Noise('white'),hp=new Tone.Filter(8000,'highpass'),am=new Tone.Tremolo({frequency:20,depth:0.9}).start();
    n.connect(hp);hp.connect(am);am.connect(g);toDry(g);
    return{gain:g,start:function(){n.start();},stop:function(){n.stop();},setVolume:function(v){g.gain.rampTo(v*0.25,0.5);}};
  })();
  // insects_night
  attribs.insects_night=(function(){
    var g=new Tone.Gain(0),n=new Tone.Noise('white'),bp=new Tone.Filter(6000,'bandpass'),am=new Tone.Tremolo({frequency:35,depth:0.8}).start();
    bp.Q.value=4;n.connect(bp);bp.connect(am);am.connect(g);toDry(g);
    return{gain:g,start:function(){n.start();},stop:function(){n.stop();},setVolume:function(v){g.gain.rampTo(v*0.35,0.5);}};
  })();
  // horses
  attribs.horses=(function(){
    var g=new Tone.Gain(0),s=new Tone.MembraneSynth({pitchDecay:0.06,octaves:4,envelope:{attack:0.001,decay:0.4,sustain:0,release:0.1}}),loop;
    s.connect(g);toDry(g);
    var pat=[0,120,240,360];
    function gallop(){pat.forEach(function(t){setTimeout(function(){try{s.triggerAttackRelease('C2',0.05);}catch(e){}},t);});}
    return{gain:g,start:function(){loop=setInterval(gallop,2800+Math.random()*2000);},stop:function(){clearInterval(loop);},setVolume:function(v){g.gain.rampTo(v*0.7,0.5);}};
  })();
  attribs.waterfall=makeNoise('white',3000,'lowpass',true);
  // blizzard
  attribs.blizzard=(function(){
    var g=new Tone.Gain(0),n=new Tone.Noise('white'),lp=new Tone.Filter(4000,'lowpass'),ch=new Tone.Chorus(3,2,0.5).start();
    n.connect(lp);lp.connect(ch);ch.connect(g);toWet(g);
    return{gain:g,start:function(){n.start();},stop:function(){n.stop();},setVolume:function(v){g.gain.rampTo(v*0.9,0.5);}};
  })();
  // sandstorm
  attribs.sandstorm=(function(){
    var g=new Tone.Gain(0),n=new Tone.Noise('brown'),d=new Tone.Distortion(0.6),lp=new Tone.Filter(2000,'lowpass');
    n.connect(d);d.connect(lp);lp.connect(g);toDry(g);
    return{gain:g,start:function(){n.start();},stop:function(){n.stop();},setVolume:function(v){g.gain.rampTo(v*0.8,0.5);}};
  })();
  // geothermal
  attribs.geothermal=(function(){
    var g=new Tone.Gain(0),o=new Tone.Oscillator(40,'sawtooth'),lp=new Tone.Filter(200,'lowpass'),n=new Tone.Noise('brown'),nlp=new Tone.Filter(300,'lowpass'),mix=new Tone.Gain(0.5);
    o.connect(lp);n.connect(nlp);lp.connect(mix);nlp.connect(mix);mix.connect(g);toWet(g);
    return{gain:g,start:function(){o.start();n.start();},stop:function(){o.stop();n.stop();},setVolume:function(v){g.gain.rampTo(v*0.7,0.5);}};
  })();
  attribs.traffic=makeNoise('pink',600,'lowpass',false);
  // crowd
  attribs.crowd=(function(){
    var g=new Tone.Gain(0),noises=['pink','white','brown'].map(function(t){return new Tone.Noise(t);}),filters=[800,1500,3000].map(function(f){var fi=new Tone.Filter(f,'bandpass');fi.Q.value=3;return fi;});
    noises.forEach(function(n,i){n.connect(filters[i]);filters[i].connect(g);});toDry(g);
    return{gain:g,start:function(){noises.forEach(function(n){n.start();});},stop:function(){noises.forEach(function(n){n.stop();});},setVolume:function(v){g.gain.rampTo(v*0.6,0.5);}};
  })();
  // subway
  attribs.subway=(function(){
    var g=new Tone.Gain(0),n=new Tone.Noise('brown'),lp=new Tone.Filter(500,'lowpass'),lfo=new Tone.LFO({frequency:0.05,min:200,max:800});
    lfo.connect(lp.frequency);lfo.start();n.connect(lp);lp.connect(g);toDry(g);
    return{gain:g,start:function(){n.start();},stop:function(){n.stop();},setVolume:function(v){g.gain.rampTo(v*0.8,0.5);}};
  })();
  // sirens
  attribs.sirens=(function(){
    var g=new Tone.Gain(0),o=new Tone.Oscillator(600,'sawtooth'),lfo=new Tone.LFO({frequency:0.5,min:600,max:900});
    lfo.connect(o.frequency);lfo.start();o.connect(g);toBoth(g,0.2);
    return{gain:g,start:function(){o.start();},stop:function(){o.stop();},setVolume:function(v){g.gain.rampTo(v*0.3,0.5);}};
  })();
  // rain_city
  attribs.rain_city=(function(){
    var g=new Tone.Gain(0),n1=new Tone.Noise('white'),n2=new Tone.Noise('pink'),hp=new Tone.Filter(600,'highpass'),lp=new Tone.Filter(400,'lowpass');
    n1.connect(hp);n2.connect(lp);hp.connect(g);lp.connect(g);toDry(g);
    return{gain:g,start:function(){n1.start();n2.start();},stop:function(){n1.stop();n2.stop();},setVolume:function(v){g.gain.rampTo(v*0.7,0.5);}};
  })();
  // singing_bowls
  attribs.singing_bowls=(function(){
    var g=new Tone.Gain(0),s=new Tone.FMSynth({harmonicity:5.1,modulationIndex:32,oscillator:{type:'sine'},envelope:{attack:0.5,decay:2,sustain:0.4,release:4},modulation:{type:'sine'}}),loop,i=0;
    s.connect(g);toWet(g);
    var notes=['D3','A3','E3','G3'];
    function strike(){try{s.triggerAttackRelease(notes[i++%notes.length],4);}catch(e){}}
    return{gain:g,start:function(){strike();loop=setInterval(strike,5500+Math.random()*4000);},stop:function(){clearInterval(loop);},setVolume:function(v){g.gain.rampTo(v*0.7,0.5);}};
  })();
  // chimes
  attribs.chimes=(function(){
    var g=new Tone.Gain(0),s=new Tone.MetalSynth({frequency:400,envelope:{attack:0.001,decay:1.4,release:0.2},harmonicity:5.1,modulationIndex:32,resonance:4000,octaves:1.5}),loop;
    s.connect(g);toWet(g);
    var ns=[400,533,640,800,1067];
    function chime(){if(Math.random()<0.7){s.frequency.value=ns[Math.floor(Math.random()*ns.length)];try{s.triggerAttackRelease('16n');}catch(e){}}}
    return{gain:g,start:function(){loop=setInterval(chime,900+Math.random()*1500);},stop:function(){clearInterval(loop);},setVolume:function(v){g.gain.rampTo(v*0.5,0.5);}};
  })();
  // whispers
  attribs.whispers=(function(){
    var g=new Tone.Gain(0),n=new Tone.Noise('white'),hp=new Tone.Filter(2000,'highpass'),ch=new Tone.Chorus(2,3,0.7).start(),r2=new Tone.Reverb({decay:6,wet:0.8});
    n.connect(hp);hp.connect(ch);ch.connect(r2);r2.connect(g);toDry(g);
    return{gain:g,start:function(){n.start();},stop:function(){n.stop();},setVolume:function(v){g.gain.rampTo(v*0.35,0.5);}};
  })();
  // choir_pad
  attribs.choir_pad=(function(){
    var g=new Tone.Gain(0),oscs=[new Tone.Oscillator({frequency:'C3',type:'sine'}),new Tone.Oscillator({frequency:'E3',type:'sine'}),new Tone.Oscillator({frequency:'G3',type:'sine'}),new Tone.Oscillator({frequency:'B3',type:'sine'})],ch=new Tone.Chorus(1.5,3.5,0.8).start(),g2=new Tone.Gain(0.25);
    oscs.forEach(function(o,i){o.detune.value=(i-1.5)*8;o.connect(ch);});ch.connect(g2);g2.connect(g);toWet(g);
    return{gain:g,start:function(){oscs.forEach(function(o){o.start();});},stop:function(){oscs.forEach(function(o){o.stop();});},setVolume:function(v){g.gain.rampTo(v*0.55,0.5);}};
  })();
  // portal_hum
  attribs.portal_hum=(function(){
    var g=new Tone.Gain(0),o1=new Tone.Oscillator({frequency:60,type:'sine'}),o2=new Tone.Oscillator({frequency:120.4,type:'sine'}),o3=new Tone.Oscillator({frequency:180.8,type:'sine'}),mix=new Tone.Gain(0.33),fl=new Tone.Chorus(0.3,20,0.9).start();
    [o1,o2,o3].forEach(function(o){o.connect(mix);});mix.connect(fl);fl.connect(g);toWet(g);
    return{gain:g,start:function(){[o1,o2,o3].forEach(function(o){o.start();});},stop:function(){[o1,o2,o3].forEach(function(o){o.stop();});},setVolume:function(v){g.gain.rampTo(v*0.6,0.5);}};
  })();
  // heartbeat
  attribs.heartbeat=(function(){
    var g=new Tone.Gain(0),k=new Tone.MembraneSynth({pitchDecay:0.05,octaves:8,envelope:{attack:0.001,decay:0.3,sustain:0,release:0.1}}),loop;
    k.connect(g);toDry(g);
    function beat(){try{k.triggerAttackRelease('C1','8n');}catch(e){}setTimeout(function(){try{k.triggerAttackRelease('C1','8n');}catch(e){}},250);}
    return{gain:g,start:function(){beat();loop=setInterval(beat,1000);},stop:function(){clearInterval(loop);},setVolume:function(v){g.gain.rampTo(v*0.8,0.5);}};
  })();
  // war_drums
  attribs.war_drums=(function(){
    var g=new Tone.Gain(0),d=new Tone.MembraneSynth({pitchDecay:0.08,octaves:5,envelope:{attack:0.001,decay:0.5,sustain:0,release:0.2}}),loop;
    d.connect(g);toWet(g);
    var pat=[0,300,600,900,1200];
    function march(){pat.forEach(function(t){setTimeout(function(){try{d.triggerAttackRelease('C1','8n');}catch(e){}},t);});}
    return{gain:g,start:function(){march();loop=setInterval(march,2000);},stop:function(){clearInterval(loop);},setVolume:function(v){g.gain.rampTo(v*0.9,0.5);}};
  })();
  // tension_drone
  attribs.tension_drone=(function(){
    var g=new Tone.Gain(0),o1=new Tone.Oscillator({frequency:55,type:'sawtooth'}),o2=new Tone.Oscillator({frequency:55.5,type:'sawtooth'}),o3=new Tone.Oscillator({frequency:82,type:'sine'}),lp2=new Tone.Filter(300,'lowpass');
    [o1,o2,o3].forEach(function(o){o.connect(lp2);});lp2.connect(g);toWet(g);
    return{gain:g,start:function(){[o1,o2,o3].forEach(function(o){o.start();});},stop:function(){[o1,o2,o3].forEach(function(o){o.stop();});},setVolume:function(v){g.gain.rampTo(v*0.5,0.5);}};
  })();
  // thunder_distant
  attribs.thunder_distant=(function(){
    var g=new Tone.Gain(0),n=new Tone.Noise('brown'),env=new Tone.AmplitudeEnvelope({attack:0.05,decay:5,sustain:0,release:3}),lp3=new Tone.Filter(300,'lowpass'),loop;
    n.connect(lp3);lp3.connect(env);env.connect(g);toWet(g);
    function rumble(){env.triggerAttackRelease(5);}
    return{gain:g,start:function(){rumble();loop=setInterval(rumble,18000+Math.random()*20000);},stop:function(){clearInterval(loop);},setVolume:function(v){g.gain.rampTo(v*0.6,0.1);}};
  })();
  // blacksmith
  attribs.blacksmith=(function(){
    var g=new Tone.Gain(0),m=new Tone.MetalSynth({frequency:200,envelope:{attack:0.001,decay:0.5,release:0.1},harmonicity:5.1,modulationIndex:16,resonance:2000,octaves:1}),loop;
    m.connect(g);toWet(g);
    function clang(){try{m.triggerAttackRelease('16n');}catch(e){}}
    return{gain:g,start:function(){loop=setInterval(clang,700+Math.random()*800);},stop:function(){clearInterval(loop);},setVolume:function(v){g.gain.rampTo(v*0.7,0.5);}};
  })();
  // church_bells
  attribs.church_bells=(function(){
    var g=new Tone.Gain(0),s=new Tone.FMSynth({harmonicity:8,modulationIndex:20,envelope:{attack:0.001,decay:4,sustain:0,release:2},modulation:{type:'sine'}}),loop,bi=0;
    s.connect(g);toWet(g);
    var bells=['C4','E4','G4','C5'];
    function ring(){try{s.triggerAttackRelease(bells[bi++%bells.length],'1m');}catch(e){}}
    return{gain:g,start:function(){loop=setInterval(ring,12000+Math.random()*15000);},stop:function(){clearInterval(loop);},setVolume:function(v){g.gain.rampTo(v*0.65,0.5);}};
  })();
  // tavern_crowd
  attribs.tavern_crowd=(function(){
    var g=new Tone.Gain(0),n1=new Tone.Noise('pink'),f1=new Tone.Filter(800,'bandpass'),n2=new Tone.Noise('brown'),f2=new Tone.Filter(400,'lowpass');
    f1.Q.value=2;n1.connect(f1);n2.connect(f2);f1.connect(g);f2.connect(g);toDry(g);
    return{gain:g,start:function(){n1.start();n2.start();},stop:function(){n1.stop();n2.stop();},setVolume:function(v){g.gain.rampTo(v*0.65,0.5);}};
  })();
  // seagulls
  attribs.seagulls=(function(){
    var g=new Tone.Gain(0),s=new Tone.Synth({oscillator:{type:'sawtooth'},envelope:{attack:0.2,decay:0.3,sustain:0.5,release:0.5}}),loop;
    s.connect(g);toWet(g);
    function cry(){try{s.triggerAttack('D5');setTimeout(function(){try{s.frequency.rampTo('A4',0.4);}catch(e){}},300);setTimeout(function(){try{s.triggerRelease();}catch(e){}},800);}catch(e){}}
    return{gain:g,start:function(){loop=setInterval(cry,3500+Math.random()*5000);},stop:function(){clearInterval(loop);},setVolume:function(v){g.gain.rampTo(v*0.5,0.5);}};
  })();
  // dripping_cave
  attribs.dripping_cave=(function(){
    var g=new Tone.Gain(0),s=new Tone.Synth({oscillator:{type:'sine'},envelope:{attack:0.001,decay:0.3,sustain:0,release:0.5}}),loop;
    s.connect(g);toWet(g);
    var ns=['C5','E5','G5','A5'];
    function drip(){if(Math.random()<0.6){try{s.triggerAttackRelease(ns[Math.floor(Math.random()*ns.length)],'32n');}catch(e){}}}
    return{gain:g,start:function(){loop=setInterval(drip,700+Math.random()*1200);},stop:function(){clearInterval(loop);},setVolume:function(v){g.gain.rampTo(v*0.45,0.5);}};
  })();
}

function applyAttribute(name,enabled,volume){
  if(!attribs[name])return;
  attributeVolumes[name]=volume!==undefined?volume:(attributeVolumes[name]||0.7);
  if(enabled&&!enabledAttributes.has(name)){
    enabledAttributes.add(name);
    attribs[name].setVolume(0);
    if(attribs[name].start)attribs[name].start();
    setTimeout(function(){if(enabledAttributes.has(name))attribs[name].setVolume(attributeVolumes[name]);},100);
  }else if(!enabled&&enabledAttributes.has(name)){
    enabledAttributes.delete(name);
    attribs[name].setVolume(0);
  }
  if(enabled)attribs[name].setVolume(attributeVolumes[name]);
}

function applyState(state){
  if(!state)return;
  if(state.masterVolume!==undefined){masterVolume=state.masterVolume;masterGain.gain.rampTo(muted?0:masterVolume,0.3);}
  if(state.muted!==undefined){muted=state.muted;masterGain.gain.rampTo(muted?0:masterVolume,0.3);}
  if(state.phaseParams){reverb.wet.rampTo(state.phaseParams.reverb,1);lpf.frequency.rampTo(state.phaseParams.lpfFreq,1);pitchShift.pitch=state.phaseParams.masterPitch||0;}
  if(state.attributes){Object.entries(state.attributes).forEach(function(e){applyAttribute(e[0],e[1].enabled,e[1].volume);});}
}

async function ensureStarted(state){
  if(!started){
    init();
    await Tone.start();
    started=true;
    post({type:'STARTED'});
  }
  if(state)applyState(state);
}

function handleMsg(data){
  var msg;try{msg=JSON.parse(data);}catch{return;}
  switch(msg.type){
    case'START':ensureStarted(msg.state);break;
    case'SET_STATE':if(!started)ensureStarted(msg.state);else applyState(msg.state);break;
    case'SET_ATTRIBUTE':if(started)applyAttribute(msg.name,msg.enabled,msg.volume);break;
    case'SET_ATTRIBUTE_VOLUME':if(started&&attribs[msg.name]){attributeVolumes[msg.name]=msg.value;if(enabledAttributes.has(msg.name))attribs[msg.name].setVolume(msg.value);}break;
    case'SET_MASTER_VOLUME':masterVolume=msg.value;if(!muted&&started)masterGain.gain.rampTo(masterVolume,0.3);break;
    case'SET_MUTED':muted=msg.muted;if(started)masterGain.gain.rampTo(muted?0:masterVolume,0.3);break;
    case'SET_PHASE_PARAMS':if(started){if(msg.reverb!==undefined)reverb.wet.rampTo(msg.reverb,1);if(msg.lpfFreq!==undefined)lpf.frequency.rampTo(msg.lpfFreq,1);if(msg.masterPitch!==undefined)pitchShift.pitch=msg.masterPitch;}break;
    case'STOP_ALL':if(started){enabledAttributes.forEach(function(name){if(attribs[name])attribs[name].setVolume(0);});enabledAttributes.clear();}break;
  }
}

function post(msg){if(window.ReactNativeWebView){window.ReactNativeWebView.postMessage(JSON.stringify(msg));}}

window.addEventListener('message',function(e){handleMsg(e.data);});
document.addEventListener('message',function(e){handleMsg(e.data);});

setTimeout(function(){post({type:'READY'});},500);
})();
<\/script>
</body></html>`;

// Native implementation
let WebView: any = null;
if (Platform.OS !== 'web') {
  try {
    WebView = require('react-native-webview').WebView;
  } catch {}
}

const AudioEngineNative = forwardRef<AudioEngineHandle, Props>(({ onReady }, ref) => {
  const webViewRef = useRef<any>(null);
  const readyRef = useRef(false);
  const queueRef = useRef<string[]>([]);

  const flush = useCallback(() => {
    if (!webViewRef.current) return;
    while (queueRef.current.length > 0) {
      const msg = queueRef.current.shift()!;
      try { webViewRef.current?.postMessage(msg); } catch {}
    }
  }, []);

  const sendToEngine = useCallback((msg: Record<string, unknown>) => {
    const json = JSON.stringify(msg);
    if (readyRef.current && webViewRef.current) {
      try { webViewRef.current.postMessage(json); } catch {}
    } else {
      queueRef.current.push(json);
    }
  }, []);

  const startWithState = useCallback((state: AtmosphereState) => {
    sendToEngine({ type: 'START', state });
  }, [sendToEngine]);

  useImperativeHandle(ref, () => ({ sendToEngine, startWithState }));

  const onMessage = useCallback((event: any) => {
    try {
      const msg = JSON.parse(event.nativeEvent.data);
      if (msg.type === 'READY' || msg.type === 'STARTED') {
        readyRef.current = true;
        flush();
        if (msg.type === 'READY') onReady?.();
      }
    } catch {}
  }, [flush, onReady]);

  const htmlContent = buildEngineHtml();

  return (
    <View style={{ width: 1, height: 1, position: 'absolute', opacity: 0 }}>
      <WebView
        ref={webViewRef}
        source={{ html: htmlContent }}
        onMessage={onMessage}
        allowsInlineMediaPlayback
        mediaPlaybackRequiresUserAction={false}
        style={{ width: 1, height: 1 }}
        javaScriptEnabled
        originWhitelist={['*']}
      />
    </View>
  );
});
AudioEngineNative.displayName = 'AudioEngineNative';

export const AudioEngine: React.ComponentType<Props & { ref?: React.Ref<AudioEngineHandle> }> =
  Platform.OS !== 'web' && WebView ? AudioEngineNative : AudioEngineStub;
