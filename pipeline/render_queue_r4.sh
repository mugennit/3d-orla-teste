#!/usr/bin/env bash
# Rodada 4: só as vistas que comprovam as correções (granito, vasos, mesa, entrada). Retomável.
set -u
R=/home/user/3d-orla-teste; D=$R/docs/m1/rodada4; mkdir -p $D
Q=("conf-cuba" "conf-geladeira" "conf-mesa" "conf-cadeira" "jantar-detalhe")
for v in "${Q[@]}"; do
  [ -f "$D/final-$v.jpg" ] && continue
  echo "[fila] $v $(date +%H:%M)"
  (cd /tmp && PYTHONPATH=/opt/bpy:/opt/pydeps python3 $R/pipeline/master_scene.py -- --res 1280x720 --samples 192 --blend r4.blend $v > $R/.cache/master/log_r4_$v.txt 2>&1) \
    && cp $R/.cache/master/render-$v.jpg "$D/final-$v.jpg" && echo "[ok] $v $(date +%H:%M)" || { echo "[erro] $v"; tail -5 $R/.cache/master/log_r4_$v.txt; }
done
echo "[fim] $(ls $D/final-*.jpg 2>/dev/null | wc -l) vistas"
