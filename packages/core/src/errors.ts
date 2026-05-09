export class MeasureOptionsError extends Error {
  public readonly field: string;
  public override readonly name = "MeasureOptionsError";

  constructor(message: string, field: string) {
    super(message);
    this.field = field;
  }
}

export class PluginLoadError extends Error {
  public override readonly name = "PluginLoadError";
}

export class PluginHookTimeout extends Error {
  public override readonly name = "PluginHookTimeout";
}

export class PluginIncompatibleDriver extends Error {
  public override readonly name = "PluginIncompatibleDriver";
}
