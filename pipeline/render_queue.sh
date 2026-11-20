#!/usr/bin/env bash
# Renders finais da rodada 3, retomáveis: pula vistas já salvas em docs/m1/rodada3/final-*.jpg.
set -u
R=/home/user/3d-orla-teste; D=$R/docs/m1/rodada3; mkdir -p $D
Q=("sala-cozinha 1920x1080 512" "cozinha 1920x1080 512" "sofa-detalhe 1600x900 256"
   "cozinha-book 1280x720 192" "jantar-detalhe 1280x720 192" "conf-sofa-lateral 1280x720 192"
   "conf-cozinha-perto 1280x720 192" "conf-geladeira 1280x720 192" "conf-cuba 1280x720 192" "conf-cadeira 1280x720 192")
for q in "${Q[@]}"; do
  set -- $q
  [ -f "$D/final-$1.jpg" ] && continue
  echo "[fila] $1 $2 $3 $(date +%H:%M)"
  (cd /tmp && PYTHONPATH=/opt/bpy:/opt/pydeps python3 $R/pipeline/master_scene.py -- --res $2 --samples $3 $1 > $R/.cache/master/log_final_$1.txt 2>&1) \
    && cp $R/.cache/master/render-$1.jpg "$D/final-$1.jpg" && echo "[ok] $1 $(date +%H:%M)" || { echo "[erro] $1"; tail -5 $R/.cache/master/log_final_$1.txt; }
done
echo "[fim] $(ls $D/final-*.jpg 2>/dev/null | wc -l) vistas"
