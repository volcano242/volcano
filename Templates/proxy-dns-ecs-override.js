function main(config) {
  if (
    config.dns &&
    Object.prototype.hasOwnProperty.call(
      config.dns,
      "proxy-server-nameserver"
    )
  ) {
    config.dns["proxy-server-nameserver"] = [
      "https://doh.pub/dns-query#ecs=221.220.50.0/24&ecs-override=true",
      "https://dns.alidns.com/dns-query#ecs=221.220.50.0/24&ecs-override=true"
    ];
  }

  return config;
}