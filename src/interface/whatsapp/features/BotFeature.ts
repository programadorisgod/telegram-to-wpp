export interface BotFeature {
  /** Unique namespace for this feature (e.g. "dcm", "tasks") */
  readonly name: string;

  /** Render menu entries for the aggregated main menu */
  getMenuEntries(): string[];

  /** Render the feature's submenu view (shown when user enters this feature).
   *  If not implemented, falls back to the aggregated main menu. */
  getSubmenuMenu?(): string;

  /** Handle a command when user is in this feature's submenu context.
   *  Return true if handled, false if unrecognized. */
  handleSubmenuCommand?(
    sender: string,
    command: string,
    data: Record<string, any>,
  ): Promise<boolean>;

  /** Handle input while in a waiting state owned by this feature.
   *  context is namespace-stripped (e.g. "waiting_name" not "dcm::waiting_name").
   *  Return true unconditionally if context is yours (even on validation error). */
  handleWaitingInput?(
    sender: string,
    text: string,
    context: string,
    data: Record<string, any>,
  ): Promise<boolean>;

  /** Optional: text aliases that route to this feature (e.g. ["clientes"]) */
  getTextAliases?(): string[];

  /** Optional: help entries for this feature */
  getHelpEntries?(): string[];

  /** Optional: check if this feature is available for a given sender.
   *  If not implemented, the feature is available to all authorized users. */
  isAvailableFor?(sender: string): boolean;
}
