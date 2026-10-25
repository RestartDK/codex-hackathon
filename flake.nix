{
  description = "Loups-Garous development environment";

  inputs.nixpkgs.url = "github:NixOS/nixpkgs/nixpkgs-unstable";

  outputs =
    { nixpkgs, ... }:
    let
      bunSources = {
        x86_64-linux = {
          target = "linux-x64-baseline";
          hash = "sha256-4ERutVmVdy65iUvrrppr42jZhai5Jx7hJEhvmUbu3XY=";
        };
        aarch64-linux = {
          target = "linux-aarch64";
          hash = "sha256-uqa7NvUdblhWHgK76oJQOKnfRU9nPW13bou/hvjHhQ4=";
        };
        aarch64-darwin = {
          target = "darwin-aarch64";
          hash = "sha256-wkDX8My5DCY6hJ/NsJt+5iYw2SE0jtaq/ahrnVd7xRA=";
        };
      };
      forAllSystems = nixpkgs.lib.genAttrs (builtins.attrNames bunSources);
      packageJson = builtins.fromJSON (builtins.readFile ./package.json);
      nodeVersion = nixpkgs.lib.strings.trim (builtins.readFile ./.node-version);
    in
    {
      formatter = forAllSystems (system: nixpkgs.legacyPackages.${system}.nixfmt-tree);

      devShells = forAllSystems (
        system:
        let
          pkgs = nixpkgs.legacyPackages.${system};
          nodejs = pkgs.nodejs_26;
          bun = pkgs.bun.overrideAttrs (
            finalAttrs: previousAttrs: {
              version = packageJson.devEngines.packageManager.version;
              src = finalAttrs.passthru.sources.${system};
              passthru = previousAttrs.passthru // {
                sources = nixpkgs.lib.mapAttrs (
                  _: source:
                  pkgs.fetchurl {
                    url = "https://github.com/oven-sh/bun/releases/download/bun-v${finalAttrs.version}/bun-${source.target}.zip";
                    inherit (source) hash;
                  }
                ) bunSources;
              };
            }
          );
        in
        {
          default =
            assert nixpkgs.lib.assertMsg (
              nodejs.version == nodeVersion
            ) "Update .node-version and the locked nixpkgs Node package together.";
            pkgs.mkShellNoCC {
              packages = [
                nodejs
                bun
              ];
            };
        }
      );
    };
}
