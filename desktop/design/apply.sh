#!/bin/sh
# Run in the desktop session so Plasma can reload the appearance.
set -eu
for key in font menuFont toolBarFont smallestReadableFont fixed; do
  current=$(kreadconfig6 --file kdeglobals --group General --key "$key")
  case "$current" in
    *,*)
      family='Hanken Grotesk'
      [ "$key" != fixed ] || family='Geist Mono'
      kwriteconfig6 --file kdeglobals --group General --key "$key" "$family,${current#*,}"
      ;;
  esac
done
plasma-apply-colorscheme Foxbard
plasma-apply-desktoptheme foxbard
plasma-apply-wallpaperimage /opt/foxbard/design/wallpaper-paper.svg
