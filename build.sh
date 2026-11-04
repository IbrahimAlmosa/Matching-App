#!/bin/bash
set -e
cd "$(dirname "$0")"
OUT=${OUT:-voluntr.html}

{
cat <<'H'
<title>VOLUNTR</title>
<meta name="description" content="VOLUNTR by Pitt County Cares: volunteer matching for Pitt County nonprofits. Sprint 4 training build.">
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="claude:viewport-fit-sides" content="cover">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Atkinson+Hyperlegible:wght@400;700&family=Public+Sans:wght@400;500;600;700;800&display=swap">
<style>
H
cat src/styles.css
cat <<'H'
</style>
<div class="page">
  <div class="train">
    <h1><span class="tag">TRAINING</span> VOLUNTR working system <span class="sub" style="font-weight:500">Sprint 4 · data saved in this browser</span></h1>
    <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">
      <div class="seg dev-seg" role="group" aria-label="Preview size"><button data-device="phone" aria-pressed="false">Phone</button><button data-device="desktop" aria-pressed="false">Desktop</button></div>
      <button class="btn quiet small" data-act="training">Training tools</button>
    </div>
  </div>
  <div class="app" id="app" data-device="phone">
    <header class="top"><div class="brand">VOLUNTR<small>by Pitt County Cares</small></div><div class="right"><div class="helpline">Prefer to talk to someone?<b>Call PCC: (252) 555-0100</b></div><div class="textsize" role="group" aria-label="Text size"><button data-size="1" aria-pressed="true" aria-label="Standard text">A</button><button data-size="1.15" aria-pressed="false" aria-label="Larger text" style="font-size:15px">A</button><button data-size="1.3" aria-pressed="false" aria-label="Largest text" style="font-size:18px">A</button></div><div class="who" id="who"></div></div></header>
    <main class="screen" id="screen" tabindex="-1"></main>
    <nav class="tabs" id="tabs" aria-label="Main"></nav>
    <div class="toast" id="toast" role="status" aria-live="polite" hidden></div>
    <div id="sheet"></div>
  </div>
  <p class="sub" style="max-width:560px;text-align:center">Training copy with fictional people and organizations. Emails are shown as in-app notifications. Use Training tools to reset.</p>
</div>
<script>
H
cat src/core.js
echo '</script>'
echo '<script>'
cat src/app.js
echo '</script>'
} > $OUT
wc -c $OUT
