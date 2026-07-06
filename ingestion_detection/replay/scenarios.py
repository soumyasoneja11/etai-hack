"""Replay scenarios — attack window boundaries (0-based row indices)."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

DATA_DIR = Path(__file__).resolve().parents[2] / "data"


@dataclass(frozen=True)
class ReplayScenario:
    name: str
    description: str
    csv_file: str
    attack_start_row: int
    primary: bool = False
    backup: bool = False

    @property
    def path(self) -> Path:
        return DATA_DIR / self.csv_file


SCENARIOS: dict[str, ReplayScenario] = {
    "portscan": ReplayScenario(
        name="portscan",
        description=(
            "Friday afternoon PortScan — primary demo. "
            "B maps stages to ATT&CK (e.g. T1046 Network Service Discovery, T1595 Active Scanning)."
        ),
        csv_file="Friday-WorkingHours-Afternoon-PortScan.pcap_ISCX.csv",
        attack_start_row=1463,
        primary=True,
    ),
    "ddos": ReplayScenario(
        name="ddos",
        description="Friday afternoon DDoS — backup scenario.",
        csv_file="Friday-WorkingHours-Afternoon-DDos.pcap_ISCX.csv",
        attack_start_row=18883,
        backup=True,
    ),
    "bot": ReplayScenario(
        name="bot",
        description="Friday morning Bot traffic — backup scenario.",
        csv_file="Friday-WorkingHours-Morning.pcap_ISCX.csv",
        attack_start_row=24072,
        backup=True,
    ),
}


def get_scenario(name: str | None = None) -> ReplayScenario:
    if name:
        key = name.lower()
        if key not in SCENARIOS:
            raise KeyError(f"Unknown scenario '{name}'. Choose from: {list(SCENARIOS)}")
        return SCENARIOS[key]
    for scenario in SCENARIOS.values():
        if scenario.primary:
            return scenario
    return SCENARIOS["portscan"]
