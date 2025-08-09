# Alexandria Architecture (Target State)

This directory captures our target internal architecture for the Alexandria app. It provides
lightweight diagrams and guidance to help contributors and AI agents converge on consistent
patterns over time.

Diagrams are written in PlantUML (`*.puml`). You can view them using any PlantUML-compatible
viewer or CI task. See PlantUML docs: [PlantUML](https://plantuml.com/)

## Overview

This target architecture can be described loosely as a pragmatic modular monolith. Key components are to be kept modular and relatively isolated so that they can be refactored or swapped with minimal disruption. However, Alexandria is a rapidly-evolving application, as is the whole Nostr ecosystem, so smart pragmatism is to be preferred over dogmatic adherence to a strict architectural vision.
