# Extrait les pals possédés d'un Level.sav de Palworld en JSON compact,
# avec leur conteneur (équipe, palbox, base) si le dossier Players/ est fourni.
#
# Usage : py scripts/extract-pals.py <Level.sav> <sortie.json> [dossier Players]
#
# Nécessite : py -m pip install palworld-save-tools pyooz

import json
import os
import sys

from palworld_save_tools.gvas import GvasFile
from palworld_save_tools.palsav import decompress_sav_to_gvas
from palworld_save_tools.paltypes import (
    PALWORLD_CUSTOM_PROPERTIES,
    PALWORLD_TYPE_HINTS,
)

# Seuls les décodeurs des personnages et des bases nous intéressent ; les
# autres structures (objets de la carte, fondations…) restent en octets bruts,
# ce qui évite leurs vérifications strictes qui cassent sur les sauvegardes 1.0.
NEEDED_CUSTOM_PROPERTIES = {
    path: handlers
    for path, handlers in PALWORLD_CUSTOM_PROPERTIES.items()
    if "CharacterSaveParameterMap" in path
    or path
    in (
        ".worldSaveData.BaseCampSaveData.Value.RawData",
        ".worldSaveData.BaseCampSaveData.Value.WorkerDirector.RawData",
    )
}

ZERO_UID = "00000000-0000-0000-0000-000000000000"

# Palworld 1.0 ajoute des champs en fin des blocs binaires que
# palworld-save-tools 0.24 ne connaît pas ('Warning: EOF not reached').
# On ne fait que lire : on remplace les décodeurs par des versions tolérantes
# qui ignorent les octets de fin (les champs utiles sont lus en premier).
import palworld_save_tools.rawdata.base_camp as pst_base_camp
import palworld_save_tools.rawdata.character as pst_character
import palworld_save_tools.rawdata.worker_director as pst_worker_director


def _tolerant_character(parent_reader, char_bytes):
    reader = parent_reader.internal_copy(bytes(char_bytes), debug=False)
    return {"object": reader.properties_until_end()}


def _tolerant_base_camp(parent_reader, b_bytes):
    reader = parent_reader.internal_copy(bytes(b_bytes), debug=False)
    return {
        "id": reader.guid(),
        "name": reader.fstring(),
        "state": reader.byte(),
        "transform": reader.ftransform(),
        "area_range": reader.float(),
        "group_id_belong_to": reader.guid(),
    }


def _tolerant_worker_director(parent_reader, b_bytes):
    reader = parent_reader.internal_copy(bytes(b_bytes), debug=False)
    return {
        "id": reader.guid(),
        "spawn_transform": reader.ftransform(),
        "current_order_type": reader.byte(),
        "current_battle_type": reader.byte(),
        "container_id": reader.guid(),
    }


pst_character.decode_bytes = _tolerant_character
pst_base_camp.decode_bytes = _tolerant_base_camp
pst_worker_director.decode_bytes = _tolerant_worker_director


def sav_to_gvas(data: bytes) -> bytes:
    """Décompresse un .sav : PlZ (zlib, pré-1.0) ou PlM (Oodle, 1.0+).

    En-tête commun (12 octets) : taille décompressée (int32 LE),
    taille compressée (int32 LE), magic (3 octets), type (1 octet).
    """
    magic = data[8:11]
    if magic == b"PlZ":
        raw, _ = decompress_sav_to_gvas(data)
        return raw
    if magic == b"PlM":
        import ooz  # pyooz

        save_type = data[11]
        if save_type != 0x31:
            raise Exception(f"type de sauvegarde PlM inattendu : {save_type:#x}")
        uncompressed_len = int.from_bytes(data[0:4], "little")
        raw = bytes(ooz.decompress(data[12:], uncompressed_len))
        if len(raw) != uncompressed_len:
            raise Exception(
                f"décompression Oodle incohérente : {len(raw)} != {uncompressed_len}"
            )
        return raw
    raise Exception(f"format de sauvegarde inconnu (magic {magic!r})")


def get(node, *path, default=None):
    """Navigue dans l'arbre GVAS ({'value': ...} imbriqués)."""
    current = node
    for key in path:
        if isinstance(current, dict) and key in current:
            current = current[key]
        else:
            return default
    return current


def read_gvas(path, custom_properties):
    with open(path, "rb") as f:
        data = f.read()
    raw_gvas = sav_to_gvas(data)
    return GvasFile.read(
        raw_gvas, PALWORLD_TYPE_HINTS, custom_properties, allow_nan=True
    )


def read_player_containers(players_dir):
    """Lit les .sav des joueurs : conteneurs équipe et palbox par joueur."""
    containers = {}  # uid joueur -> {"party": guid, "box": guid}
    if not players_dir or not os.path.isdir(players_dir):
        return containers
    for name in os.listdir(players_dir):
        if not name.lower().endswith(".sav"):
            continue
        try:
            gvas = read_gvas(os.path.join(players_dir, name), {})
        except Exception as e:  # fichier annexe ou format inattendu
            print(f"Joueur {name} illisible : {e}", file=sys.stderr)
            continue
        save = get(gvas.properties, "SaveData", "value", default={})
        uid = str(get(save, "PlayerUId", "value", default=""))
        party = str(
            get(save, "OtomoCharacterContainerId", "value", "ID", "value", default="")
        )
        box = str(
            get(save, "PalStorageContainerId", "value", "ID", "value", default="")
        )
        if uid:
            containers[uid] = {"party": party, "box": box}
    return containers


def main():
    if len(sys.argv) not in (3, 4):
        print(__doc__)
        sys.exit(2)
    sav_path, out_path = sys.argv[1], sys.argv[2]
    players_dir = sys.argv[3] if len(sys.argv) == 4 else None

    print(f"Décompression et parsing de {sav_path}...", file=sys.stderr)
    gvas = read_gvas(sav_path, NEEDED_CUSTOM_PROPERTIES)

    char_map = get(
        gvas.properties, "worldSaveData", "value", "CharacterSaveParameterMap", "value"
    )
    if char_map is None:
        print("CharacterSaveParameterMap introuvable dans la sauvegarde", file=sys.stderr)
        sys.exit(1)

    players = {}
    pals = []

    for entry in char_map:
        params = get(
            entry, "value", "RawData", "value", "object", "SaveParameter", "value"
        )
        if not isinstance(params, dict):
            continue

        if get(params, "IsPlayer", "value", default=False):
            uid = str(get(entry, "key", "PlayerUId", "value", default=""))
            players[uid] = {
                "uid": uid,
                "name": get(params, "NickName", "value", default="(sans nom)"),
            }
            continue

        character_id = get(params, "CharacterID", "value")
        if not character_id:
            continue

        owner = str(get(params, "OwnerPlayerUId", "value", default="") or "")
        if not owner or owner == ZERO_UID:
            old_owners = get(params, "OldOwnerPlayerUIds", "value", "values", default=[])
            owner = str(old_owners[0]) if old_owners else ""
        if not owner or owner == ZERO_UID:
            continue  # pal sauvage ou sans propriétaire

        gender = get(params, "Gender", "value", "value", default="")
        passives = get(params, "PassiveSkillList", "value", "values", default=[])

        def scalar(name, default=0):
            v = get(params, name, "value", default=default)
            if isinstance(v, dict):  # ByteProperty : {'type': ..., 'value': n}
                v = v.get("value", default)
            return v

        level = scalar("Level", 1)
        # IVs (talents) : 0-100
        ivs = {
            "hp": scalar("Talent_HP"),
            "attack": scalar("Talent_Shot"),
            "defense": scalar("Talent_Defense"),
        }
        nickname = get(params, "NickName", "value", default=None)
        container = str(
            get(params, "SlotId", "value", "ContainerId", "value", "ID", "value", default="")
        )
        pals.append(
            {
                "characterId": character_id,
                "owner": owner,
                "gender": str(gender).split("::")[-1].upper() or None,
                "level": level,
                "ivs": ivs,
                "nickname": nickname,
                "container": container or None,
                "passives": list(passives),
            }
        )

    # Bases : conteneur des pals ouvriers de chaque camp.
    bases = []
    base_map = get(gvas.properties, "worldSaveData", "value", "BaseCampSaveData", "value")
    if isinstance(base_map, list):
        for entry in base_map:
            raw = get(entry, "value", "RawData", "value", default={})
            director = get(entry, "value", "WorkerDirector", "value", "RawData", "value", default={})
            container = str(director.get("container_id", "") or "")
            if container:
                # Le jeu remplit le nom avec un modèle japonais placeholder
                # tant que la base n'a pas été renommée par le joueur.
                name = (raw.get("name") or "").strip()
                if "テンプレート" in name or "(仮)" in name:
                    name = ""
                bases.append({"name": name or None, "container": container})

    result = {
        "players": sorted(players.values(), key=lambda p: p["name"]),
        "pals": pals,
        "bases": bases,
        "playerContainers": read_player_containers(players_dir),
    }
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(result, f, ensure_ascii=False)
    print(
        f"{len(players)} joueur(s), {len(pals)} pals possédés, "
        f"{len(bases)} base(s) -> {out_path}",
        file=sys.stderr,
    )


if __name__ == "__main__":
    main()
