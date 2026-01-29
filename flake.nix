{
  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    flake-utils.url = "github:numtide/flake-utils";
  };

  outputs = { self, nixpkgs, flake-utils }:
    flake-utils.lib.eachDefaultSystem (system:
      let pkgs = import nixpkgs { inherit system; };
      in {
        devShells.default = pkgs.mkShell {
          buildInputs = [ pkgs.deno pkgs.firefox-esr pkgs.chromium ];
          shellHook = ''
            export CHROMIUM_PATH="${pkgs.chromium}/bin/chromium"
            export FIREFOX_PATH="${pkgs.firefox-esr}/bin/firefox"
            export PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
            export TW_BROWSER=''${TW_BROWSER:-chromium}
          '';
        };
      });
}
