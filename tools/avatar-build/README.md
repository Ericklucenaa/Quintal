# Avatares da sala 3D

Gera `desktop/public/avatars/*.glb` a partir de personagens CC0 da Quaternius:
Universal Base Characters (corpos, cabelos) e Universal Animation Library 1 e 2 (animações).

1. Baixe os pacotes Standard (gratuitos, CC0) e extraia em `D:/Projetos/tools/downloads/quaternius/x`.
2. `blender -b --python build_avatars.py` (Blender 4.5): corpos com regiões de pele, roupas geradas do próprio corpo, saias, vestido, cabelos.
3. `npm install && node build_anims.mjs`: junta as animações usadas, com os ossos renomeados para o esqueleto dos corpos.
