# agent-roles

A Paseo plugin that gives each kind of agent its own instructions and tool limits, so an orchestrator cannot drift into implementing work itself.

## Language

**Role**:
A named set of instructions and tool limits applied to every agent that matches its rule. Defined by the user in one config file.
_Avoid_: Profile (that is Paseo's saved launch settings), persona, mode

**Match rule**:
The conditions that decide whether an agent gets a Role: patterns on the agent's title, model, provider, and working directory. All stated conditions must hold; the first Role whose rule holds wins.
_Avoid_: Filter, selector, matcher

**Denied tool**:
A built-in Pi tool a Role may not use. The agent does not see it, and any call to it is blocked.
_Avoid_: Disabled tool, blocked tool

**Read-only bash**:
A Role setting under which bash runs only commands that inspect state, plus Paseo's own CLI.
_Avoid_: Safe mode, plan mode

**Orchestrator**:
The agent that plans, delegates to workers, and reviews. In this project it is simply the agent holding a Role with edit and write denied.
_Avoid_: Main agent, lead, manager

**Worker**:
An agent launched by an orchestrator to carry out one task, usually in its own worktree.
_Avoid_: Subagent (Paseo's UI term, fine in UI copy), implementer
