'use strict';

/**
 * Bloxd live protocol descriptor (build 7rp1w/57cd8edd, version 856).
 *
 * Generated from the frozen 854 evidence in
 * .research/7rp1w-audit/generated/*; the generated schemas, ids,
 * call sites and disposition ledger are embedded below so product runtime does
 * not depend on .research.
 *
 * The 853 -> 854 mapping audit proved every mapped packet pair is positionally
 * identical on the wire, so handler-facing schemas and field maps are kept
 * unchanged; only ids, evidence, ledger rows and the documented 854 wire field
 * names are regenerated. New or explicitly unmapped schemas keep their 853
 * field names. Every inbound schema id and outbound schema id has an explicit
 * disposition in PROTOCOL_LEDGER. Placeholder names are deliberate
 * (SPacketInbound<id>, SPacketHandler<id>, CPacketOutbound<id>,
 * CPacketCallSite<id>) and are marked by the generated schema/semantic
 * evidence pointer; they are not invented protocol names.
 */

const { Type } = require('avsc');
const TARGET = require('./target.js');

const VERSION = TARGET.version;

const EVIDENCE = {
  "build": "7rp1w",
  "buildVersion": "57cd8edd",
  "generatedManifestSha256": "ea70f18f94840eb4886735ac8777d2d7c6924d55d8bba7ad97a3fddb6fd80318",
  "generatedDir": ".research/7rp1w-audit/generated",
  "files": {
    "assets.json": {
      "bytes": 9873599,
      "sha256": "8d59114a0d85beea556e7d7e224f80f3c4ed7afc34e454b079974a39d13d6df8"
    },
    "inbound-ids.json": {
      "bytes": 2621,
      "sha256": "ab285fa1ff36b8ff9ca1bf1146c438cec3695d39b36d497c27e1aca3fe7ead88"
    },
    "inbound-schemas.json": {
      "bytes": 95709,
      "sha256": "cf5a7eb970c3ee9cc2a6f760bc360612876af39ef192dc4dc0d12dd2e0d15d63"
    },
    "inbound-semantics.json": {
      "bytes": 70948,
      "sha256": "b630e15fa3d00c1ad73eb5c4999e45bdea508174ad32e7df5b8b0a819f9b2e69"
    },
    "outbound-call-sites.json": {
      "bytes": 23784,
      "sha256": "980a6f390c87d4072581f4d2ed46da908f21804303622b5f73386913b6791458"
    },
    "outbound-ids.json": {
      "bytes": 2357,
      "sha256": "408a17e3599ccc24aa5c187cd18def476baf90404b57fdc0f4839f6bd6047013"
    },
    "outbound-schemas.json": {
      "bytes": 40954,
      "sha256": "0bbe61c32e306757240340a58906aa27786a51feb539c1c3bce582f94e0ce1a6"
    },
    "registry.json": {
      "bytes": 4135681,
      "sha256": "607e137fe0cd36a143d004bcf8091a8a6a42c0f44a457ccd60df96b337d8c597"
    },
    "transport.json": {
      "bytes": 998,
      "sha256": "61be2a6ca4a5423fa0c3417da78480aa2a51883dc8479b2ce5d189075a7e1e05"
    }
  }
};

// Build identity comes from the single canonical target module.
Object.assign(EVIDENCE, {
  build: TARGET.build,
  buildVersion: TARGET.buildVersion,
  generatedManifestSha256: TARGET.generatedManifestSha256
});

const INBOUND_SCHEMA_EVIDENCE = [
  {
    "id": 0,
    "schema": {
      "type": "record",
      "fields": [
        {
          "name": "id",
          "type": [
            "null",
            "string"
          ]
        }
      ]
    }
  },
  {
    "id": 3,
    "schema": {
      "type": "record",
      "fields": [
        {
          "name": "CT",
          "type": "string"
        },
        {
          "name": "TT",
          "type": "int"
        }
      ]
    }
  },
  {
    "id": 4,
    "schema": "string"
  },
  {
    "id": 6,
    "schema": "int"
  },
  {
    "id": 7,
    "schema": {
      "type": "record",
      "fields": [
        {
          "name": "kE",
          "type": "string"
        },
        {
          "name": "qE",
          "type": "double"
        },
        {
          "name": "QE",
          "type": "double"
        },
        {
          "name": "FE",
          "type": "double"
        }
      ]
    }
  },
  {
    "id": 8,
    "schema": {
      "type": "record",
      "fields": [
        {
          "name": "Bs",
          "type": "int"
        },
        {
          "name": "qs",
          "type": "boolean"
        }
      ]
    }
  },
  {
    "id": 9,
    "schema": "string"
  },
  {
    "id": 11,
    "schema": "float"
  },
  {
    "id": 12,
    "schema": {
      "type": "array",
      "items": "int"
    }
  },
  {
    "id": 13,
    "schema": "float"
  },
  {
    "id": 15,
    "schema": "string"
  },
  {
    "id": 17,
    "schema": {
      "type": "record",
      "fields": [
        {
          "name": "Ws",
          "type": {
            "type": "array",
            "items": [
              "string",
              {
                "name": "entityName",
                "type": "record",
                "fields": [
                  {
                    "name": "entityName",
                    "type": "string"
                  }
                ]
              },
              {
                "name": "translatedText",
                "type": "record",
                "fields": [
                  {
                    "name": "translationKey",
                    "type": "string"
                  },
                  {
                    "name": "params",
                    "type": [
                      "null",
                      {
                        "type": "map",
                        "values": [
                          "string",
                          "int",
                          "boolean",
                          {
                            "type": "record",
                            "fields": [
                              {
                                "name": "entityName",
                                "type": "string"
                              }
                            ]
                          }
                        ]
                      }
                    ]
                  }
                ]
              },
              {
                "name": "styledIcon",
                "type": "record",
                "fields": [
                  {
                    "name": "icon",
                    "type": "string"
                  },
                  {
                    "name": "style",
                    "type": [
                      "null",
                      {
                        "type": "record",
                        "fields": [
                          {
                            "name": "color",
                            "type": [
                              "null",
                              "string"
                            ]
                          },
                          {
                            "name": "colour",
                            "type": [
                              "null",
                              "string"
                            ]
                          },
                          {
                            "name": "fontSize",
                            "type": [
                              "null",
                              "string"
                            ]
                          }
                        ]
                      }
                    ]
                  }
                ]
              },
              {
                "name": "Yy",
                "type": "record",
                "fields": [
                  {
                    "name": "str",
                    "type": [
                      "string",
                      {
                        "name": "styledEntityName",
                        "type": "record",
                        "fields": [
                          {
                            "name": "entityName",
                            "type": "string"
                          }
                        ]
                      },
                      {
                        "name": "styledTranslatedText",
                        "type": "record",
                        "fields": [
                          {
                            "name": "translationKey",
                            "type": "string"
                          },
                          {
                            "name": "params",
                            "type": [
                              "null",
                              {
                                "type": "map",
                                "values": [
                                  "string",
                                  "int",
                                  "boolean",
                                  {
                                    "type": "record",
                                    "fields": [
                                      {
                                        "name": "entityName",
                                        "type": "string"
                                      }
                                    ]
                                  }
                                ]
                              }
                            ]
                          }
                        ]
                      }
                    ]
                  },
                  {
                    "name": "style",
                    "type": [
                      "null",
                      {
                        "name": "Ay",
                        "type": "record",
                        "fields": [
                          {
                            "name": "color",
                            "type": [
                              "null",
                              "string"
                            ]
                          },
                          {
                            "name": "colour",
                            "type": [
                              "null",
                              "string"
                            ]
                          },
                          {
                            "name": "fontWeight",
                            "type": [
                              "null",
                              "string",
                              "int"
                            ]
                          },
                          {
                            "name": "fontStyle",
                            "type": [
                              "null",
                              "string"
                            ]
                          },
                          {
                            "name": "fontSize",
                            "type": [
                              "null",
                              "string"
                            ]
                          },
                          {
                            "name": "opacity",
                            "type": [
                              "null",
                              "float"
                            ]
                          }
                        ]
                      }
                    ]
                  },
                  {
                    "name": "clickableUrl",
                    "type": [
                      "null",
                      "string"
                    ]
                  }
                ]
              },
              {
                "name": "styledProgressBar",
                "type": "record",
                "fields": [
                  {
                    "name": "type",
                    "type": "string"
                  },
                  {
                    "name": "progress",
                    "type": "float"
                  },
                  {
                    "name": "width",
                    "type": [
                      "null",
                      "string"
                    ]
                  },
                  {
                    "name": "height",
                    "type": [
                      "null",
                      "string"
                    ]
                  },
                  {
                    "name": "colours",
                    "type": [
                      "null",
                      {
                        "type": "array",
                        "items": "string"
                      }
                    ]
                  },
                  {
                    "name": "backgroundColour",
                    "type": [
                      "null",
                      "string"
                    ]
                  }
                ]
              },
              {
                "name": "styledKeyBinding",
                "type": "record",
                "fields": [
                  {
                    "name": "type",
                    "type": "string"
                  },
                  {
                    "name": "action",
                    "type": "string"
                  },
                  {
                    "name": "style",
                    "type": [
                      "null",
                      "Ay"
                    ]
                  }
                ]
              }
            ]
          }
        },
        {
          "name": "HO",
          "type": "float"
        },
        {
          "name": "Q2",
          "type": "int"
        }
      ]
    }
  },
  {
    "id": 18,
    "schema": {
      "type": "record",
      "fields": [
        {
          "name": "aT",
          "type": "int"
        },
        {
          "name": "NT",
          "type": "double"
        },
        {
          "name": "VT",
          "type": "double"
        },
        {
          "name": "mH",
          "type": "double"
        }
      ]
    }
  },
  {
    "id": 22,
    "schema": {
      "type": "array",
      "items": "int"
    }
  },
  {
    "id": 24,
    "schema": {
      "type": "record",
      "fields": [
        {
          "name": "nT",
          "type": "string"
        },
        {
          "name": "Ii",
          "type": [
            "null",
            "boolean"
          ]
        },
        {
          "name": "ET",
          "type": [
            "null",
            "bytes"
          ]
        },
        {
          "name": "sharedBlockData",
          "type": [
            "null",
            "bytes"
          ]
        },
        {
          "name": "QT",
          "type": [
            "null",
            "bytes"
          ]
        },
        {
          "name": "Vt",
          "type": [
            "null",
            "boolean"
          ]
        }
      ]
    }
  },
  {
    "id": 25,
    "schema": {
      "type": "record",
      "fields": [
        {
          "name": "Bz",
          "type": "string"
        },
        {
          "name": "qz",
          "type": "float"
        },
        {
          "name": "Zz",
          "type": "float"
        },
        {
          "name": "Az",
          "type": "float"
        },
        {
          "name": "lz",
          "type": "float"
        },
        {
          "name": "Sz",
          "type": "float"
        },
        {
          "name": "Iz",
          "type": "float"
        },
        {
          "name": "fz",
          "type": {
            "type": "array",
            "items": "float"
          }
        },
        {
          "name": "gi",
          "type": {
            "type": "array",
            "items": {
              "type": "record",
              "fields": [
                {
                  "name": "Fi",
                  "type": "float"
                },
                {
                  "name": "zi",
                  "type": "float"
                },
                {
                  "name": "iD",
                  "type": "float"
                }
              ]
            }
          }
        },
        {
          "name": "jD",
          "type": [
            {
              "type": "array",
              "items": {
                "type": "record",
                "fields": [
                  {
                    "name": "Fi",
                    "type": [
                      "null",
                      "float"
                    ]
                  },
                  {
                    "name": "Ri",
                    "type": [
                      "null",
                      {
                        "type": "array",
                        "items": "float"
                      }
                    ]
                  },
                  {
                    "name": "Ci",
                    "type": [
                      "null",
                      {
                        "type": "array",
                        "items": "float"
                      }
                    ]
                  },
                  {
                    "name": "Ti",
                    "type": [
                      "null",
                      {
                        "type": "array",
                        "items": "float"
                      }
                    ]
                  }
                ]
              }
            }
          ]
        },
        {
          "name": "Li",
          "type": "int"
        },
        {
          "name": "Oi",
          "type": {
            "type": "array",
            "items": "float"
          }
        },
        {
          "name": "kD",
          "type": {
            "type": "array",
            "items": "float"
          }
        },
        {
          "name": "Xi",
          "type": {
            "type": "array",
            "items": "float"
          }
        },
        {
          "name": "Wi",
          "type": {
            "type": "array",
            "items": "float"
          }
        },
        {
          "name": "ri",
          "type": "int"
        },
        {
          "name": "ai",
          "type": [
            "null",
            "float"
          ]
        }
      ]
    }
  },
  {
    "id": 29,
    "schema": {
      "type": "record",
      "fields": [
        {
          "name": "tc",
          "type": "string"
        },
        {
          "name": "Ct",
          "type": {
            "type": "array",
            "items": {
              "type": "array",
              "items": "float"
            }
          }
        }
      ]
    }
  },
  {
    "id": 30,
    "schema": "string"
  },
  {
    "id": 31,
    "schema": {
      "type": "array",
      "items": "float"
    }
  },
  {
    "id": 32,
    "schema": {
      "type": "record",
      "fields": [
        {
          "name": "OH",
          "type": "string"
        },
        {
          "name": "ks",
          "type": "int"
        },
        {
          "name": "XH",
          "type": "int"
        },
        {
          "name": "WH",
          "type": "string"
        },
        {
          "name": "bH",
          "type": "double"
        },
        {
          "name": "YH",
          "type": "double"
        },
        {
          "name": "rH",
          "type": "double"
        },
        {
          "name": "aH",
          "type": "boolean"
        }
      ]
    }
  },
  {
    "id": 33,
    "schema": "string"
  },
  {
    "id": 34,
    "schema": {
      "type": "record",
      "fields": [
        {
          "name": "bq",
          "type": "string"
        },
        {
          "name": "lq",
          "type": "boolean"
        },
        {
          "name": "Yq",
          "type": [
            "null",
            "int"
          ]
        }
      ]
    }
  },
  {
    "id": 35,
    "schema": "string"
  },
  {
    "id": 36,
    "schema": {
      "type": "record",
      "fields": [
        {
          "name": "QC",
          "type": {
            "type": "array",
            "items": "int"
          }
        },
        {
          "name": "xC",
          "type": "int"
        }
      ]
    }
  },
  {
    "id": 37,
    "schema": {
      "type": "record",
      "fields": [
        {
          "name": "W9",
          "type": "boolean"
        },
        {
          "name": "Al",
          "type": [
            "null",
            {
              "type": "array",
              "items": "float"
            }
          ]
        }
      ]
    }
  },
  {
    "id": 40,
    "schema": "int"
  },
  {
    "id": 42,
    "schema": "int"
  },
  {
    "id": 45,
    "schema": {
      "type": "record",
      "fields": [
        {
          "name": "eH",
          "type": "string"
        },
        {
          "name": "uH",
          "type": [
            "null",
            {
              "name": "KH",
              "type": "record",
              "fields": [
                {
                  "name": "Pj",
                  "type": {
                    "type": "array",
                    "items": "float"
                  }
                }
              ]
            }
          ]
        },
        {
          "name": "nH",
          "type": "boolean"
        },
        {
          "name": "EH",
          "type": "boolean"
        },
        {
          "name": "QH",
          "type": "int"
        },
        {
          "name": "xH",
          "type": [
            "null",
            "float"
          ]
        },
        {
          "name": "oH",
          "type": [
            "null",
            "double"
          ]
        }
      ]
    }
  },
  {
    "id": 46,
    "schema": {
      "type": "array",
      "items": {
        "type": "record",
        "fields": [
          {
            "name": "TE",
            "type": "string"
          },
          {
            "name": "yE",
            "type": "string"
          },
          {
            "name": "uE",
            "type": [
              "string",
              "null"
            ]
          },
          {
            "name": "lE",
            "type": {
              "type": "array",
              "items": "float"
            }
          },
          {
            "name": "mp",
            "type": {
              "type": "array",
              "items": "float"
            }
          }
        ]
      }
    }
  },
  {
    "id": 50,
    "schema": {
      "type": "array",
      "items": {
        "type": "record",
        "fields": [
          {
            "name": "WL",
            "type": {
              "type": "array",
              "items": "int"
            }
          },
          {
            "name": "bL",
            "type": "int"
          },
          {
            "name": "YL",
            "type": [
              "null",
              "string"
            ]
          }
        ]
      }
    }
  },
  {
    "id": 53,
    "schema": {
      "type": "record",
      "fields": [
        {
          "name": "NH",
          "type": "int"
        },
        {
          "name": "VH",
          "type": "string"
        },
        {
          "name": "MH",
          "type": "float"
        }
      ]
    }
  },
  {
    "id": 54,
    "schema": "int"
  },
  {
    "id": 56,
    "schema": {
      "type": "record",
      "fields": [
        {
          "name": "Qp",
          "type": "boolean"
        },
        {
          "name": "ep",
          "type": [
            "null",
            "string"
          ]
        },
        {
          "name": "TV",
          "type": {
            "type": "array",
            "items": {
              "type": "record",
              "fields": [
                {
                  "name": "di",
                  "type": "string"
                },
                {
                  "name": "x",
                  "type": "int"
                },
                {
                  "name": "y",
                  "type": "int"
                },
                {
                  "name": "z",
                  "type": "int"
                }
              ]
            }
          }
        },
        {
          "name": "dQ",
          "type": [
            "null",
            {
              "name": "UV",
              "type": "record",
              "fields": [
                {
                  "name": "layers",
                  "type": {
                    "type": "array",
                    "items": {
                      "name": "Ip",
                      "type": "record",
                      "fields": [
                        {
                          "name": "wi",
                          "type": "int"
                        },
                        {
                          "name": "li",
                          "type": "int"
                        },
                        {
                          "name": "gQ",
                          "type": "int"
                        },
                        {
                          "name": "tV",
                          "type": "boolean"
                        },
                        {
                          "name": "si",
                          "type": {
                            "name": "Xp",
                            "type": "record",
                            "fields": [
                              {
                                "name": "kV",
                                "type": "string"
                              },
                              {
                                "name": "sQ",
                                "type": [
                                  "null",
                                  {
                                    "type": "array",
                                    "items": {
                                      "name": "OQ",
                                      "type": "record",
                                      "fields": [
                                        {
                                          "name": "blockName",
                                          "type": "string"
                                        },
                                        {
                                          "name": "pQ",
                                          "type": "boolean"
                                        },
                                        {
                                          "name": "aQ",
                                          "type": "boolean"
                                        },
                                        {
                                          "name": "PQ",
                                          "type": "boolean"
                                        },
                                        {
                                          "name": "oQ",
                                          "type": "float"
                                        },
                                        {
                                          "name": "hV",
                                          "type": "float"
                                        },
                                        {
                                          "name": "fQ",
                                          "type": "int"
                                        },
                                        {
                                          "name": "nV",
                                          "type": [
                                            "null",
                                            {
                                              "name": "zp",
                                              "type": "record",
                                              "fields": [
                                                {
                                                  "name": "EQ",
                                                  "type": "float"
                                                },
                                                {
                                                  "name": "QV",
                                                  "type": "int"
                                                },
                                                {
                                                  "name": "VV",
                                                  "type": "int"
                                                }
                                              ]
                                            }
                                          ]
                                        }
                                      ]
                                    }
                                  }
                                ]
                              }
                            ]
                          }
                        },
                        {
                          "name": "AQ",
                          "type": {
                            "type": "array",
                            "items": {
                              "name": "upi",
                              "type": "record",
                              "fields": [
                                {
                                  "name": "CQ",
                                  "type": "string"
                                },
                                {
                                  "name": "ZQ",
                                  "type": "string"
                                },
                                {
                                  "name": "frequency",
                                  "type": "float"
                                },
                                {
                                  "name": "cV",
                                  "type": {
                                    "type": "array",
                                    "items": {
                                      "name": "jsi",
                                      "type": "record",
                                      "fields": [
                                        {
                                          "name": "blockName",
                                          "type": "string"
                                        },
                                        {
                                          "name": "frequency",
                                          "type": "float"
                                        }
                                      ]
                                    }
                                  }
                                }
                              ]
                            }
                          }
                        },
                        {
                          "name": "ei",
                          "type": {
                            "type": "array",
                            "items": {
                              "name": "Bl",
                              "type": "record",
                              "fields": [
                                {
                                  "name": "blockName",
                                  "type": "string"
                                },
                                {
                                  "name": "radius",
                                  "type": "int"
                                },
                                {
                                  "name": "WQ",
                                  "type": "int"
                                },
                                {
                                  "name": "wi",
                                  "type": "int"
                                },
                                {
                                  "name": "li",
                                  "type": "int"
                                },
                                {
                                  "name": "RQ",
                                  "type": "float"
                                }
                              ]
                            }
                          }
                        }
                      ]
                    }
                  }
                },
                {
                  "name": "eV",
                  "type": [
                    "null",
                    {
                      "name": "qs",
                      "type": "record",
                      "fields": [
                        {
                          "name": "terrain",
                          "type": [
                            "null",
                            {
                              "name": "RP",
                              "type": "record",
                              "fields": [
                                {
                                  "name": "name",
                                  "type": "string"
                                },
                                {
                                  "name": "zV",
                                  "type": [
                                    "null",
                                    "string"
                                  ]
                                }
                              ]
                            }
                          ]
                        },
                        {
                          "name": "HV",
                          "type": {
                            "type": "array",
                            "items": "Bl"
                          }
                        }
                      ]
                    }
                  ]
                }
              ]
            }
          ]
        }
      ]
    }
  },
  {
    "id": 57,
    "schema": "int"
  },
  {
    "id": 58,
    "schema": "int"
  },
  {
    "id": 59,
    "schema": {
      "type": "record",
      "fields": [
        {
          "name": "UT",
          "type": {
            "type": "array",
            "items": {
              "type": "record",
              "fields": [
                {
                  "name": "wT",
                  "type": "string"
                },
                {
                  "name": "vT",
                  "type": [
                    "null",
                    "string"
                  ]
                },
                {
                  "name": "eT",
                  "type": [
                    "null",
                    "string"
                  ]
                },
                {
                  "name": "uT",
                  "type": {
                    "type": "array",
                    "items": "string"
                  }
                }
              ]
            }
          }
        },
        {
          "name": "KT",
          "type": {
            "type": "array",
            "items": "string"
          }
        }
      ]
    }
  },
  {
    "id": 60,
    "schema": {
      "type": "record",
      "fields": [
        {
          "name": "xT",
          "type": "string"
        },
        {
          "name": "soundVolume",
          "type": "float"
        },
        {
          "name": "oT",
          "type": "float"
        },
        {
          "name": "GT",
          "type": [
            "null",
            {
              "type": "record",
              "fields": [
                {
                  "name": "BT",
                  "type": [
                    "string",
                    {
                      "type": "array",
                      "items": "double"
                    }
                  ]
                },
                {
                  "name": "qT",
                  "type": "float"
                },
                {
                  "name": "ZT",
                  "type": "float"
                }
              ]
            }
          ]
        }
      ]
    }
  },
  {
    "id": 63,
    "schema": "string"
  },
  {
    "id": 64,
    "schema": {
      "type": "record",
      "fields": [
        {
          "name": "iL",
          "type": "string"
        },
        {
          "name": "jL",
          "type": {
            "type": "array",
            "items": "int"
          }
        }
      ]
    }
  },
  {
    "id": 65,
    "schema": "string"
  },
  {
    "id": 68,
    "schema": {
      "type": "record",
      "fields": [
        {
          "name": "T6",
          "type": "int"
        },
        {
          "name": "K6",
          "type": "double"
        },
        {
          "name": "w6",
          "type": "double"
        },
        {
          "name": "D6",
          "type": "double"
        },
        {
          "name": "Z6",
          "type": "double"
        },
        {
          "name": "g6",
          "type": "double"
        },
        {
          "name": "R6",
          "type": "double"
        },
        {
          "name": "f6",
          "type": "double"
        },
        {
          "name": "i5",
          "type": [
            "null",
            {
              "type": "record",
              "fields": [
                {
                  "name": "I9",
                  "type": "double"
                },
                {
                  "name": "J9",
                  "type": {
                    "type": "array",
                    "items": "double"
                  }
                }
              ]
            }
          ]
        }
      ]
    }
  },
  {
    "id": 72,
    "schema": {
      "type": "record",
      "fields": [
        {
          "name": "RL",
          "type": "boolean"
        },
        {
          "name": "CL",
          "type": [
            "null",
            "string"
          ]
        }
      ]
    }
  },
  {
    "id": 74,
    "schema": {
      "type": "map",
      "values": {
        "type": "map",
        "values": {
          "name": "Rk",
          "type": "record",
          "fields": [
            {
              "name": "iN",
              "type": [
                "null",
                {
                  "type": "array",
                  "items": "double"
                }
              ]
            },
            {
              "name": "mN",
              "type": [
                "null",
                {
                  "type": "array",
                  "items": "double"
                }
              ]
            },
            {
              "name": "kN",
              "type": [
                "null",
                "double"
              ]
            },
            {
              "name": "qN",
              "type": [
                "null",
                "double"
              ]
            },
            {
              "name": "iW",
              "type": [
                "null",
                "boolean"
              ]
            },
            {
              "name": "hN",
              "type": [
                "null",
                {
                  "type": "array",
                  "items": {
                    "name": "XN",
                    "type": "record",
                    "fields": [
                      {
                        "name": "timeFraction",
                        "type": "double"
                      },
                      {
                        "name": "minColor",
                        "type": {
                          "type": "array",
                          "items": "double"
                        }
                      },
                      {
                        "name": "maxColor",
                        "type": {
                          "type": "array",
                          "items": "double"
                        }
                      }
                    ]
                  }
                }
              ]
            }
          ]
        }
      }
    }
  },
  {
    "id": 75,
    "schema": {
      "type": "record",
      "fields": [
        {
          "name": "Qs",
          "type": "int"
        },
        {
          "name": "Hs",
          "type": "boolean"
        },
        {
          "name": "Fs",
          "type": "float"
        }
      ]
    }
  },
  {
    "id": 76,
    "schema": {
      "type": "array",
      "items": "int"
    }
  },
  {
    "id": 77,
    "schema": "string"
  },
  {
    "id": 81,
    "schema": {
      "type": "record",
      "fields": [
        {
          "name": "Zs",
          "type": "boolean"
        },
        {
          "name": "ps",
          "type": [
            "null",
            "string"
          ]
        },
        {
          "name": "As",
          "type": "string"
        },
        {
          "name": "AD",
          "type": [
            "null",
            {
              "type": "array",
              "items": "int"
            }
          ]
        },
        {
          "name": "ls",
          "type": [
            "null",
            {
              "type": "array",
              "items": "int"
            }
          ]
        },
        {
          "name": "Ss",
          "type": "boolean"
        },
        {
          "name": "Is",
          "type": "int"
        },
        {
          "name": "fs",
          "type": [
            "null",
            "string"
          ]
        }
      ]
    }
  },
  {
    "id": 82,
    "schema": {
      "type": "record",
      "fields": [
        {
          "name": "qV",
          "type": {
            "type": "array",
            "items": {
              "type": "record",
              "fields": [
                {
                  "name": "pE",
                  "type": {
                    "type": "array",
                    "items": "int"
                  }
                },
                {
                  "name": "aE",
                  "type": "int"
                },
                {
                  "name": "sE",
                  "type": "int"
                },
                {
                  "name": "OE",
                  "type": "int"
                }
              ]
            }
          }
        },
        {
          "name": "qH",
          "type": {
            "type": "array",
            "items": {
              "type": "array",
              "items": "int"
            }
          }
        }
      ]
    }
  },
  {
    "id": 83,
    "schema": "int"
  },
  {
    "id": 87,
    "schema": {
      "type": "record",
      "fields": [
        {
          "name": "P5",
          "type": {
            "type": "array",
            "items": "double"
          }
        },
        {
          "name": "n_",
          "type": "boolean"
        }
      ]
    }
  },
  {
    "id": 88,
    "schema": {
      "type": "record",
      "fields": [
        {
          "name": "Fj",
          "type": "string"
        },
        {
          "name": "zj",
          "type": "string"
        },
        {
          "name": "iR",
          "type": [
            "null",
            "string",
            {
              "type": "record",
              "fields": [
                {
                  "name": "translationKey",
                  "type": "string"
                },
                {
                  "name": "params",
                  "type": [
                    "null",
                    {
                      "type": "map",
                      "values": [
                        "string",
                        "int",
                        "boolean",
                        {
                          "type": "record",
                          "fields": [
                            {
                              "name": "entityName",
                              "type": "string"
                            }
                          ]
                        }
                      ]
                    }
                  ]
                }
              ]
            }
          ]
        },
        {
          "name": "hT",
          "type": "string"
        },
        {
          "name": "JT",
          "type": [
            "null",
            "double"
          ]
        },
        {
          "name": "yT",
          "type": "float"
        }
      ]
    }
  },
  {
    "id": 89,
    "schema": {
      "type": "array",
      "items": {
        "type": "array",
        "items": "int"
      }
    }
  },
  {
    "id": 90,
    "schema": "string"
  },
  {
    "id": 91,
    "schema": {
      "type": "record",
      "fields": [
        {
          "name": "TL",
          "type": {
            "type": "record",
            "fields": [
              {
                "name": "HL",
                "type": "string"
              },
              {
                "name": "sL",
                "type": [
                  "null",
                  "string"
                ]
              },
              {
                "name": "cL",
                "type": [
                  "null",
                  "string"
                ]
              },
              {
                "name": "LL",
                "type": [
                  "null",
                  "string"
                ]
              },
              {
                "name": "OL",
                "type": [
                  "null",
                  "int"
                ]
              }
            ]
          }
        },
        {
          "name": "kP",
          "type": "boolean"
        }
      ]
    }
  },
  {
    "id": 92,
    "schema": {
      "type": "array",
      "items": "float"
    }
  },
  {
    "id": 94,
    "schema": {
      "type": "record",
      "fields": [
        {
          "name": "Vl",
          "type": "int"
        },
        {
          "name": "Ul",
          "type": "string"
        },
        {
          "name": "Gl",
          "type": [
            "null",
            "int"
          ]
        },
        {
          "name": "bR",
          "type": [
            "null",
            "int"
          ]
        },
        {
          "name": "gR",
          "type": [
            "null",
            "string"
          ]
        },
        {
          "name": "Ml",
          "type": [
            "null",
            "string"
          ]
        },
        {
          "name": "fR",
          "type": [
            "null",
            "string"
          ]
        },
        {
          "name": "oR",
          "type": [
            "null",
            "string"
          ]
        },
        {
          "name": "pR",
          "type": [
            "null",
            "string"
          ]
        },
        {
          "name": "Tl",
          "type": [
            "null",
            "int"
          ]
        },
        {
          "name": "Kl",
          "type": [
            "null",
            "int"
          ]
        },
        {
          "name": "kS",
          "type": [
            "null",
            "string"
          ]
        },
        {
          "name": "qS",
          "type": [
            "null",
            "string"
          ]
        },
        {
          "name": "nS",
          "type": [
            "null",
            "string"
          ]
        }
      ]
    }
  },
  {
    "id": 97,
    "schema": {
      "type": "record",
      "fields": [
        {
          "name": "Us",
          "type": {
            "type": "array",
            "items": "int"
          }
        },
        {
          "name": "vs",
          "type": "int"
        }
      ]
    }
  },
  {
    "id": 100,
    "schema": {
      "type": "record",
      "fields": [
        {
          "name": "Gs",
          "type": "float"
        },
        {
          "name": "Xs",
          "type": "float"
        }
      ]
    }
  },
  {
    "id": 102,
    "schema": {
      "type": "record",
      "fields": [
        {
          "name": "id",
          "type": "int"
        },
        {
          "name": "r_",
          "type": {
            "name": "Y_",
            "type": "record",
            "fields": [
              {
                "name": "type",
                "type": {
                  "name": "A_",
                  "type": "enum",
                  "symbols": [
                    "progressBar",
                    "timedClick",
                    "gravityBar",
                    "precisionBar",
                    "rhythmClick"
                  ]
                }
              },
              {
                "name": "progressBar",
                "type": [
                  "null",
                  {
                    "name": "C_",
                    "type": "record",
                    "fields": [
                      {
                        "name": "jB",
                        "type": [
                          "null",
                          "double"
                        ]
                      },
                      {
                        "name": "N_",
                        "type": "double"
                      },
                      {
                        "name": "R_",
                        "type": "double"
                      },
                      {
                        "name": "qB",
                        "type": "boolean"
                      },
                      {
                        "name": "description",
                        "type": {
                          "type": "array",
                          "items": [
                            "string",
                            {
                              "name": "entityName",
                              "type": "record",
                              "fields": [
                                {
                                  "name": "entityName",
                                  "type": "string"
                                }
                              ]
                            },
                            {
                              "name": "translatedText",
                              "type": "record",
                              "fields": [
                                {
                                  "name": "translationKey",
                                  "type": "string"
                                },
                                {
                                  "name": "params",
                                  "type": [
                                    "null",
                                    {
                                      "type": "map",
                                      "values": [
                                        "string",
                                        "int",
                                        "boolean",
                                        {
                                          "type": "record",
                                          "fields": [
                                            {
                                              "name": "entityName",
                                              "type": "string"
                                            }
                                          ]
                                        }
                                      ]
                                    }
                                  ]
                                }
                              ]
                            },
                            {
                              "name": "styledIcon",
                              "type": "record",
                              "fields": [
                                {
                                  "name": "icon",
                                  "type": "string"
                                },
                                {
                                  "name": "style",
                                  "type": [
                                    "null",
                                    {
                                      "type": "record",
                                      "fields": [
                                        {
                                          "name": "color",
                                          "type": [
                                            "null",
                                            "string"
                                          ]
                                        },
                                        {
                                          "name": "colour",
                                          "type": [
                                            "null",
                                            "string"
                                          ]
                                        },
                                        {
                                          "name": "fontSize",
                                          "type": [
                                            "null",
                                            "string"
                                          ]
                                        }
                                      ]
                                    }
                                  ]
                                }
                              ]
                            },
                            {
                              "name": "Yy",
                              "type": "record",
                              "fields": [
                                {
                                  "name": "str",
                                  "type": [
                                    "string",
                                    {
                                      "name": "styledEntityName",
                                      "type": "record",
                                      "fields": [
                                        {
                                          "name": "entityName",
                                          "type": "string"
                                        }
                                      ]
                                    },
                                    {
                                      "name": "styledTranslatedText",
                                      "type": "record",
                                      "fields": [
                                        {
                                          "name": "translationKey",
                                          "type": "string"
                                        },
                                        {
                                          "name": "params",
                                          "type": [
                                            "null",
                                            {
                                              "type": "map",
                                              "values": [
                                                "string",
                                                "int",
                                                "boolean",
                                                {
                                                  "type": "record",
                                                  "fields": [
                                                    {
                                                      "name": "entityName",
                                                      "type": "string"
                                                    }
                                                  ]
                                                }
                                              ]
                                            }
                                          ]
                                        }
                                      ]
                                    }
                                  ]
                                },
                                {
                                  "name": "style",
                                  "type": [
                                    "null",
                                    {
                                      "name": "Ay",
                                      "type": "record",
                                      "fields": [
                                        {
                                          "name": "color",
                                          "type": [
                                            "null",
                                            "string"
                                          ]
                                        },
                                        {
                                          "name": "colour",
                                          "type": [
                                            "null",
                                            "string"
                                          ]
                                        },
                                        {
                                          "name": "fontWeight",
                                          "type": [
                                            "null",
                                            "string",
                                            "int"
                                          ]
                                        },
                                        {
                                          "name": "fontStyle",
                                          "type": [
                                            "null",
                                            "string"
                                          ]
                                        },
                                        {
                                          "name": "fontSize",
                                          "type": [
                                            "null",
                                            "string"
                                          ]
                                        },
                                        {
                                          "name": "opacity",
                                          "type": [
                                            "null",
                                            "float"
                                          ]
                                        }
                                      ]
                                    }
                                  ]
                                },
                                {
                                  "name": "clickableUrl",
                                  "type": [
                                    "null",
                                    "string"
                                  ]
                                }
                              ]
                            },
                            {
                              "name": "styledProgressBar",
                              "type": "record",
                              "fields": [
                                {
                                  "name": "type",
                                  "type": "string"
                                },
                                {
                                  "name": "progress",
                                  "type": "float"
                                },
                                {
                                  "name": "width",
                                  "type": [
                                    "null",
                                    "string"
                                  ]
                                },
                                {
                                  "name": "height",
                                  "type": [
                                    "null",
                                    "string"
                                  ]
                                },
                                {
                                  "name": "colours",
                                  "type": [
                                    "null",
                                    {
                                      "type": "array",
                                      "items": "string"
                                    }
                                  ]
                                },
                                {
                                  "name": "backgroundColour",
                                  "type": [
                                    "null",
                                    "string"
                                  ]
                                }
                              ]
                            },
                            {
                              "name": "styledKeyBinding",
                              "type": "record",
                              "fields": [
                                {
                                  "name": "type",
                                  "type": "string"
                                },
                                {
                                  "name": "action",
                                  "type": "string"
                                },
                                {
                                  "name": "style",
                                  "type": [
                                    "null",
                                    "Ay"
                                  ]
                                }
                              ]
                            }
                          ]
                        }
                      },
                      {
                        "name": "f_",
                        "type": "string"
                      },
                      {
                        "name": "scale",
                        "type": [
                          "null",
                          "double"
                        ]
                      },
                      {
                        "name": "rotation",
                        "type": [
                          "null",
                          "double"
                        ]
                      }
                    ]
                  }
                ]
              },
              {
                "name": "timedClick",
                "type": [
                  "null",
                  {
                    "name": "S_",
                    "type": "record",
                    "fields": [
                      {
                        "name": "o_",
                        "type": "double"
                      },
                      {
                        "name": "icon",
                        "type": "string"
                      },
                      {
                        "name": "label",
                        "type": {
                          "type": "array",
                          "items": [
                            "string",
                            "entityName",
                            "translatedText",
                            "styledIcon",
                            "Yy",
                            "styledProgressBar",
                            "styledKeyBinding"
                          ]
                        }
                      },
                      {
                        "name": "E_",
                        "type": "boolean"
                      },
                      {
                        "name": "scale",
                        "type": [
                          "null",
                          "double"
                        ]
                      },
                      {
                        "name": "rotation",
                        "type": [
                          "null",
                          "double"
                        ]
                      },
                      {
                        "name": "p_",
                        "type": [
                          "null",
                          "boolean"
                        ]
                      }
                    ]
                  }
                ]
              },
              {
                "name": "gravityBar",
                "type": [
                  "null",
                  {
                    "name": "P_",
                    "type": "record",
                    "fields": [
                      {
                        "name": "jB",
                        "type": [
                          "null",
                          "double"
                        ]
                      },
                      {
                        "name": "Q0",
                        "type": "double"
                      },
                      {
                        "name": "V0",
                        "type": "double"
                      },
                      {
                        "name": "i4",
                        "type": "double"
                      },
                      {
                        "name": "gravity",
                        "type": "double"
                      },
                      {
                        "name": "Q8",
                        "type": "double"
                      },
                      {
                        "name": "K8",
                        "type": "double"
                      },
                      {
                        "name": "Z8",
                        "type": "double"
                      },
                      {
                        "name": "qB",
                        "type": "boolean"
                      },
                      {
                        "name": "description",
                        "type": {
                          "type": "array",
                          "items": [
                            "string",
                            "entityName",
                            "translatedText",
                            "styledIcon",
                            "Yy",
                            "styledProgressBar",
                            "styledKeyBinding"
                          ]
                        }
                      },
                      {
                        "name": "icon",
                        "type": [
                          "null",
                          "string"
                        ]
                      }
                    ]
                  }
                ]
              },
              {
                "name": "precisionBar",
                "type": [
                  "null",
                  {
                    "name": "W8",
                    "type": "record",
                    "fields": [
                      {
                        "name": "speed",
                        "type": "double"
                      },
                      {
                        "name": "E8",
                        "type": "double"
                      },
                      {
                        "name": "label",
                        "type": {
                          "type": "array",
                          "items": [
                            "string",
                            "entityName",
                            "translatedText",
                            "styledIcon",
                            "Yy",
                            "styledProgressBar",
                            "styledKeyBinding"
                          ]
                        }
                      },
                      {
                        "name": "icon",
                        "type": [
                          "null",
                          "string"
                        ]
                      },
                      {
                        "name": "scale",
                        "type": [
                          "null",
                          "double"
                        ]
                      },
                      {
                        "name": "rotation",
                        "type": [
                          "null",
                          "double"
                        ]
                      }
                    ]
                  }
                ]
              },
              {
                "name": "rhythmClick",
                "type": [
                  "null",
                  {
                    "name": "iii",
                    "type": "record",
                    "fields": [
                      {
                        "name": "J4",
                        "type": "int"
                      },
                      {
                        "name": "xii",
                        "type": "double"
                      },
                      {
                        "name": "K4",
                        "type": "double"
                      },
                      {
                        "name": "vii",
                        "type": [
                          "null",
                          "int"
                        ]
                      },
                      {
                        "name": "label",
                        "type": {
                          "type": "array",
                          "items": [
                            "string",
                            "entityName",
                            "translatedText",
                            "styledIcon",
                            "Yy",
                            "styledProgressBar",
                            "styledKeyBinding"
                          ]
                        }
                      },
                      {
                        "name": "icon",
                        "type": [
                          "null",
                          "string"
                        ]
                      }
                    ]
                  }
                ]
              }
            ]
          }
        }
      ]
    }
  },
  {
    "id": 103,
    "schema": {
      "type": "record",
      "fields": [
        {
          "name": "Fj",
          "type": "string"
        },
        {
          "name": "zj",
          "type": "string"
        },
        {
          "name": "iR",
          "type": [
            "null",
            "string",
            {
              "type": "record",
              "fields": [
                {
                  "name": "translationKey",
                  "type": "string"
                },
                {
                  "name": "params",
                  "type": [
                    "null",
                    {
                      "type": "map",
                      "values": [
                        "string",
                        "int",
                        "boolean",
                        {
                          "type": "record",
                          "fields": [
                            {
                              "name": "entityName",
                              "type": "string"
                            }
                          ]
                        }
                      ]
                    }
                  ]
                }
              ]
            }
          ]
        }
      ]
    }
  },
  {
    "id": 104,
    "schema": {
      "type": "record",
      "fields": [
        {
          "name": "K9",
          "type": {
            "type": "enum",
            "symbols": [
              "brainRot",
              "stomp",
              "fertiliser",
              "bonemeal",
              "mobTameSuccess",
              "mobTameFailure",
              "mobCatch",
              "spawnCaughtMob",
              "mobFeedDefault",
              "mobFeedSuperliked",
              "mobFeedLike",
              "mobFeedNeutral",
              "mobFeedDisliked",
              "mobDeath",
              "mobDeathSoul",
              "boardShopSuccess",
              "mobSpawnerBlockFail",
              "mobSpawnerBlockPassive",
              "mobSpawnerBlockNeutral",
              "mobSpawnerBlockHostile",
              "mobSpawnOrb",
              "aura",
              "yellowFirecrackerSmall",
              "yellowFirecrackerLarge",
              "whiteFirecrackerSmall",
              "whiteFirecrackerLarge",
              "redFirecrackerSmall",
              "redFirecrackerLarge",
              "purpleFirecrackerSmall",
              "purpleFirecrackerLarge",
              "pinkFirecrackerSmall",
              "pinkFirecrackerLarge",
              "orangeFirecrackerSmall",
              "orangeFirecrackerLarge",
              "magentaFirecrackerSmall",
              "magentaFirecrackerLarge",
              "limeFirecrackerSmall",
              "limeFirecrackerLarge",
              "lightGrayFirecrackerSmall",
              "lightGrayFirecrackerLarge",
              "lightBlueFirecrackerSmall",
              "lightBlueFirecrackerLarge",
              "greenFirecrackerSmall",
              "greenFirecrackerLarge",
              "grayFirecrackerSmall",
              "grayFirecrackerLarge",
              "cyanFirecrackerSmall",
              "cyanFirecrackerLarge",
              "brownFirecrackerSmall",
              "brownFirecrackerLarge",
              "blueFirecrackerSmall",
              "blueFirecrackerLarge",
              "blackFirecrackerSmall",
              "blackFirecrackerLarge",
              "defaultFirecrackerSmall",
              "defaultFirecrackerLarge",
              "mango",
              "speedInner",
              "speedOuter",
              "damageReductionInner",
              "damageReductionOuter",
              "damageInner",
              "damageOuter",
              "invisibleInner",
              "invisibleOuter",
              "jumpBoostInner",
              "jumpBoostOuter",
              "knockbackInner",
              "knockbackOuter",
              "poisonedInner",
              "poisonedOuter",
              "slownessInner",
              "slownessOuter",
              "weaknessInner",
              "weaknessOuter",
              "cleansedInner",
              "cleansedOuter",
              "instantDamageInner",
              "instantDamageOuter",
              "healthRegenInner",
              "healthRegenOuter",
              "healingPulseInner",
              "healingPulseOuter",
              "instantHealthInner",
              "instantHealthOuter",
              "hasteInner",
              "hasteOuter",
              "shieldInner",
              "shieldOuter",
              "doubleJumpInner",
              "doubleJumpOuter",
              "heatResistanceInner",
              "heatResistanceOuter",
              "thiefInner",
              "thiefOuter",
              "xRayVisionInner",
              "xRayVisionOuter",
              "miningYieldInner",
              "miningYieldOuter",
              "brainRotInner",
              "brainRotOuter",
              "auraInner",
              "auraOuter",
              "wallClimbingInner",
              "wallClimbingOuter",
              "airWalkInner",
              "airWalkOuter",
              "pickpocketerInner",
              "pickpocketerOuter",
              "lifestealInner",
              "lifestealOuter",
              "bouncinessInner",
              "bouncinessOuter",
              "blindnessInner",
              "blindnessOuter",
              "poopyInner",
              "poopyOuter",
              "glowingInner",
              "glowingOuter",
              "nightVisionInner",
              "nightVisionOuter"
            ]
          }
        },
        {
          "name": "pos1",
          "type": {
            "type": "array",
            "items": "float"
          }
        },
        {
          "name": "pos2",
          "type": {
            "type": "array",
            "items": "float"
          }
        }
      ]
    }
  },
  {
    "id": 105,
    "schema": "int"
  },
  {
    "id": 107,
    "schema": {
      "type": "record",
      "fields": [
        {
          "name": "eId",
          "type": "string"
        },
        {
          "name": "q_",
          "type": [
            "null",
            "double"
          ]
        },
        {
          "name": "E5",
          "type": [
            "null",
            "double"
          ]
        }
      ]
    }
  },
  {
    "id": 109,
    "schema": {
      "type": "array",
      "items": "float"
    }
  },
  {
    "id": 111,
    "schema": {
      "type": "record",
      "fields": [
        {
          "name": "ZE",
          "type": [
            "null",
            "string"
          ]
        }
      ]
    }
  },
  {
    "id": 113,
    "schema": {
      "type": "array",
      "items": {
        "type": "record",
        "fields": [
          {
            "name": "pw",
            "type": "string"
          },
          {
            "name": "aT",
            "type": "string"
          },
          {
            "name": "HL",
            "type": "string"
          }
        ]
      }
    }
  },
  {
    "id": 114,
    "schema": {
      "type": "record",
      "fields": [
        {
          "name": "au",
          "type": "string"
        },
        {
          "name": "nW",
          "type": "int"
        },
        {
          "name": "VW",
          "type": "double"
        },
        {
          "name": "UW",
          "type": "double"
        },
        {
          "name": "iK",
          "type": [
            "null",
            "string"
          ]
        },
        {
          "name": "zW",
          "type": "double"
        },
        {
          "name": "animationScript",
          "type": [
            "null",
            {
              "name": "rW",
              "type": "record",
              "fields": [
                {
                  "name": "DW",
                  "type": "long"
                },
                {
                  "name": "dW",
                  "type": "int"
                },
                {
                  "name": "fW",
                  "type": [
                    "null",
                    {
                      "type": "map",
                      "values": {
                        "name": "oW",
                        "type": "record",
                        "fields": [
                          {
                            "name": "rotation",
                            "type": {
                              "type": "array",
                              "items": {
                                "name": "Ql",
                                "type": "record",
                                "fields": [
                                  {
                                    "name": "timeFraction",
                                    "type": "double"
                                  },
                                  {
                                    "name": "Xx",
                                    "type": "int"
                                  },
                                  {
                                    "name": "pre",
                                    "type": {
                                      "type": "array",
                                      "items": "double"
                                    }
                                  },
                                  {
                                    "name": "post",
                                    "type": {
                                      "type": "array",
                                      "items": "double"
                                    }
                                  },
                                  {
                                    "name": "EW",
                                    "type": "double"
                                  },
                                  {
                                    "name": "pW",
                                    "type": {
                                      "type": "array",
                                      "items": {
                                        "name": "OW",
                                        "type": "record",
                                        "fields": [
                                          {
                                            "name": "mq",
                                            "type": "double"
                                          },
                                          {
                                            "name": "hq",
                                            "type": "double"
                                          },
                                          {
                                            "name": "delta",
                                            "type": "double"
                                          }
                                        ]
                                      }
                                    }
                                  }
                                ]
                              }
                            }
                          },
                          {
                            "name": "position",
                            "type": {
                              "type": "array",
                              "items": "Ql"
                            }
                          }
                        ]
                      }
                    }
                  ]
                }
              ]
            }
          ]
        }
      ]
    }
  },
  {
    "id": 115,
    "schema": "int"
  },
  {
    "id": 116,
    "schema": {
      "type": "record",
      "fields": [
        {
          "name": "id",
          "type": "string"
        },
        {
          "name": "position",
          "type": {
            "type": "array",
            "items": "float"
          }
        },
        {
          "name": "text",
          "type": [
            "null",
            {
              "type": "array",
              "items": [
                "string",
                {
                  "name": "entityName",
                  "type": "record",
                  "fields": [
                    {
                      "name": "entityName",
                      "type": "string"
                    }
                  ]
                },
                {
                  "name": "translatedText",
                  "type": "record",
                  "fields": [
                    {
                      "name": "translationKey",
                      "type": "string"
                    },
                    {
                      "name": "params",
                      "type": [
                        "null",
                        {
                          "type": "map",
                          "values": [
                            "string",
                            "int",
                            "boolean",
                            {
                              "type": "record",
                              "fields": [
                                {
                                  "name": "entityName",
                                  "type": "string"
                                }
                              ]
                            }
                          ]
                        }
                      ]
                    }
                  ]
                },
                {
                  "name": "styledIcon",
                  "type": "record",
                  "fields": [
                    {
                      "name": "icon",
                      "type": "string"
                    },
                    {
                      "name": "style",
                      "type": [
                        "null",
                        {
                          "type": "record",
                          "fields": [
                            {
                              "name": "color",
                              "type": [
                                "null",
                                "string"
                              ]
                            },
                            {
                              "name": "colour",
                              "type": [
                                "null",
                                "string"
                              ]
                            },
                            {
                              "name": "fontSize",
                              "type": [
                                "null",
                                "string"
                              ]
                            }
                          ]
                        }
                      ]
                    }
                  ]
                },
                {
                  "name": "Yy",
                  "type": "record",
                  "fields": [
                    {
                      "name": "str",
                      "type": [
                        "string",
                        {
                          "name": "styledEntityName",
                          "type": "record",
                          "fields": [
                            {
                              "name": "entityName",
                              "type": "string"
                            }
                          ]
                        },
                        {
                          "name": "styledTranslatedText",
                          "type": "record",
                          "fields": [
                            {
                              "name": "translationKey",
                              "type": "string"
                            },
                            {
                              "name": "params",
                              "type": [
                                "null",
                                {
                                  "type": "map",
                                  "values": [
                                    "string",
                                    "int",
                                    "boolean",
                                    {
                                      "type": "record",
                                      "fields": [
                                        {
                                          "name": "entityName",
                                          "type": "string"
                                        }
                                      ]
                                    }
                                  ]
                                }
                              ]
                            }
                          ]
                        }
                      ]
                    },
                    {
                      "name": "style",
                      "type": [
                        "null",
                        {
                          "name": "Ay",
                          "type": "record",
                          "fields": [
                            {
                              "name": "color",
                              "type": [
                                "null",
                                "string"
                              ]
                            },
                            {
                              "name": "colour",
                              "type": [
                                "null",
                                "string"
                              ]
                            },
                            {
                              "name": "fontWeight",
                              "type": [
                                "null",
                                "string",
                                "int"
                              ]
                            },
                            {
                              "name": "fontStyle",
                              "type": [
                                "null",
                                "string"
                              ]
                            },
                            {
                              "name": "fontSize",
                              "type": [
                                "null",
                                "string"
                              ]
                            },
                            {
                              "name": "opacity",
                              "type": [
                                "null",
                                "float"
                              ]
                            }
                          ]
                        }
                      ]
                    },
                    {
                      "name": "clickableUrl",
                      "type": [
                        "null",
                        "string"
                      ]
                    }
                  ]
                },
                {
                  "name": "styledProgressBar",
                  "type": "record",
                  "fields": [
                    {
                      "name": "type",
                      "type": "string"
                    },
                    {
                      "name": "progress",
                      "type": "float"
                    },
                    {
                      "name": "width",
                      "type": [
                        "null",
                        "string"
                      ]
                    },
                    {
                      "name": "height",
                      "type": [
                        "null",
                        "string"
                      ]
                    },
                    {
                      "name": "colours",
                      "type": [
                        "null",
                        {
                          "type": "array",
                          "items": "string"
                        }
                      ]
                    },
                    {
                      "name": "backgroundColour",
                      "type": [
                        "null",
                        "string"
                      ]
                    }
                  ]
                },
                {
                  "name": "styledKeyBinding",
                  "type": "record",
                  "fields": [
                    {
                      "name": "type",
                      "type": "string"
                    },
                    {
                      "name": "action",
                      "type": "string"
                    },
                    {
                      "name": "style",
                      "type": [
                        "null",
                        "Ay"
                      ]
                    }
                  ]
                }
              ]
            }
          ]
        },
        {
          "name": "style",
          "type": [
            "null",
            {
              "name": "oq",
              "type": "record",
              "fields": [
                {
                  "name": "color",
                  "type": [
                    "null",
                    "string"
                  ]
                },
                {
                  "name": "colour",
                  "type": [
                    "null",
                    "string"
                  ]
                },
                {
                  "name": "fontWeight",
                  "type": [
                    "null",
                    "string",
                    "int"
                  ]
                },
                {
                  "name": "fontStyle",
                  "type": [
                    "null",
                    "string"
                  ]
                },
                {
                  "name": "fontSize",
                  "type": [
                    "null",
                    "string"
                  ]
                },
                {
                  "name": "opacity",
                  "type": [
                    "null",
                    "float"
                  ]
                }
              ]
            }
          ]
        },
        {
          "name": "xR",
          "type": "boolean"
        }
      ]
    }
  },
  {
    "id": 117,
    "schema": {
      "type": "record",
      "fields": [
        {
          "name": "k5",
          "type": "int"
        },
        {
          "name": "N9",
          "type": [
            "int",
            "null"
          ]
        },
        {
          "name": "yQ",
          "type": [
            {
              "type": "array",
              "items": "float"
            },
            "null"
          ]
        }
      ]
    }
  },
  {
    "id": 118,
    "schema": {
      "type": "record",
      "fields": [
        {
          "name": "B4",
          "type": {
            "type": "array",
            "items": "int"
          }
        },
        {
          "name": "mii",
          "type": "int"
        }
      ]
    }
  },
  {
    "id": 121,
    "schema": {
      "type": "record",
      "fields": [
        {
          "name": "lc",
          "type": [
            "null",
            "string"
          ]
        },
        {
          "name": "gL",
          "type": [
            "null",
            "string"
          ]
        }
      ]
    }
  },
  {
    "id": 122,
    "schema": {
      "type": "record",
      "fields": [
        {
          "name": "pose",
          "type": "string"
        },
        {
          "name": "T_",
          "type": {
            "type": "array",
            "items": "float"
          }
        }
      ]
    }
  },
  {
    "id": 124,
    "schema": {
      "type": "record",
      "fields": [
        {
          "name": "H2",
          "type": "string"
        },
        {
          "name": "K2",
          "type": "int"
        }
      ]
    }
  }
];
const OUTBOUND_SCHEMA_EVIDENCE = [
  {
    "id": 1,
    "schema": {
      "type": "record",
      "fields": [
        {
          "name": "gR",
          "type": {
            "type": "array",
            "items": "int"
          }
        }
      ]
    }
  },
  {
    "id": 2,
    "schema": {
      "type": "record",
      "fields": [
        {
          "name": "Vl",
          "type": "int"
        },
        {
          "name": "Ul",
          "type": "string"
        },
        {
          "name": "Gl",
          "type": [
            "null",
            "int"
          ]
        },
        {
          "name": "Ml",
          "type": [
            "null",
            "string"
          ]
        },
        {
          "name": "Tl",
          "type": [
            "null",
            "int"
          ]
        },
        {
          "name": "Kl",
          "type": [
            "null",
            "int"
          ]
        },
        {
          "name": "jD",
          "type": [
            "null",
            "boolean"
          ]
        },
        {
          "name": "qD",
          "type": [
            "null",
            "string"
          ]
        },
        {
          "name": "EA",
          "type": [
            "null",
            "string"
          ]
        }
      ]
    }
  },
  {
    "id": 4,
    "schema": {
      "type": "record",
      "fields": [
        {
          "name": "aT",
          "type": "string"
        },
        {
          "name": "HL",
          "type": "string"
        }
      ]
    }
  },
  {
    "id": 5,
    "schema": {
      "type": "record",
      "fields": [
        {
          "name": "mC",
          "type": "int"
        },
        {
          "name": "dR",
          "type": "int"
        },
        {
          "name": "hR",
          "type": "int"
        }
      ]
    }
  },
  {
    "id": 6,
    "schema": {
      "type": "record",
      "fields": [
        {
          "name": "lR",
          "type": "int"
        },
        {
          "name": "UD",
          "type": "boolean"
        },
        {
          "name": "nD",
          "type": [
            "null",
            {
              "type": "array",
              "items": "int"
            }
          ]
        },
        {
          "name": "KD",
          "type": [
            "null",
            "string"
          ]
        }
      ]
    }
  },
  {
    "id": 8,
    "schema": {
      "type": "record",
      "fields": [
        {
          "name": "hC",
          "type": "int"
        }
      ]
    }
  },
  {
    "id": 9,
    "schema": {
      "type": "record",
      "fields": [
        {
          "name": "FC",
          "type": "int"
        },
        {
          "name": "zC",
          "type": "int"
        },
        {
          "name": "iT",
          "type": "int"
        },
        {
          "name": "DC",
          "type": [
            "null",
            "int"
          ]
        }
      ]
    }
  },
  {
    "id": 10,
    "schema": {
      "type": "record",
      "fields": [
        {
          "name": "ER",
          "type": "int"
        },
        {
          "name": "QR",
          "type": "int"
        }
      ]
    }
  },
  {
    "id": 13,
    "schema": {
      "type": "record",
      "fields": [
        {
          "name": "ku",
          "type": [
            "null",
            {
              "type": "array",
              "items": "int"
            }
          ]
        },
        {
          "name": "Wy",
          "type": [
            "null",
            "string"
          ]
        },
        {
          "name": "gy",
          "type": {
            "type": "array",
            "items": "float"
          }
        },
        {
          "name": "Sy",
          "type": "int"
        },
        {
          "name": "Py",
          "type": "string"
        }
      ]
    }
  },
  {
    "id": 14,
    "schema": "string"
  },
  {
    "id": 16,
    "schema": "boolean"
  },
  {
    "id": 17,
    "schema": {
      "type": "record",
      "fields": [
        {
          "name": "fps",
          "type": [
            "float",
            "null"
          ]
        },
        {
          "name": "qT",
          "type": [
            "float",
            "null"
          ]
        },
        {
          "name": "pT",
          "type": [
            "boolean",
            "null"
          ]
        },
        {
          "name": "eT",
          "type": [
            "int",
            "null"
          ]
        },
        {
          "name": "hT",
          "type": [
            "int",
            "null"
          ]
        },
        {
          "name": "XT",
          "type": [
            "int",
            "null"
          ]
        },
        {
          "name": "wT",
          "type": [
            "int",
            "null"
          ]
        },
        {
          "name": "lT",
          "type": [
            "int",
            "null"
          ]
        },
        {
          "name": "yB",
          "type": [
            "int",
            "null"
          ]
        },
        {
          "name": "cB",
          "type": [
            "int",
            "null"
          ]
        },
        {
          "name": "aT",
          "type": [
            "boolean",
            "null"
          ]
        },
        {
          "name": "HA",
          "type": [
            "boolean",
            "null"
          ]
        },
        {
          "name": "aB",
          "type": [
            "float",
            "null"
          ]
        },
        {
          "name": "qB",
          "type": [
            "float",
            "null"
          ]
        },
        {
          "name": "pB",
          "type": [
            "float",
            "null"
          ]
        },
        {
          "name": "yJ",
          "type": [
            "float",
            "null"
          ]
        },
        {
          "name": "iJ",
          "type": [
            "float",
            "null"
          ]
        },
        {
          "name": "xJ",
          "type": [
            "float",
            "null"
          ]
        },
        {
          "name": "YB",
          "type": [
            "float",
            "null"
          ]
        },
        {
          "name": "XB",
          "type": [
            "float",
            "null"
          ]
        },
        {
          "name": "lB",
          "type": [
            "float",
            "null"
          ]
        },
        {
          "name": "vJ",
          "type": [
            "float",
            "null"
          ]
        },
        {
          "name": "oB",
          "type": [
            "float",
            "null"
          ]
        },
        {
          "name": "nB",
          "type": [
            "float",
            "null"
          ]
        },
        {
          "name": "bJ",
          "type": [
            "float",
            "null"
          ]
        },
        {
          "name": "QI",
          "type": [
            "float",
            "null"
          ]
        },
        {
          "name": "gJ",
          "type": [
            "float",
            "null"
          ]
        },
        {
          "name": "uB",
          "type": [
            "float",
            "null"
          ]
        },
        {
          "name": "mJ",
          "type": [
            "float",
            "null"
          ]
        },
        {
          "name": "aJ",
          "type": [
            "float",
            "null"
          ]
        },
        {
          "name": "qJ",
          "type": [
            "float",
            "null"
          ]
        },
        {
          "name": "eJ",
          "type": [
            "float",
            "null"
          ]
        },
        {
          "name": "ZJ",
          "type": [
            "float",
            "null"
          ]
        },
        {
          "name": "OJ",
          "type": [
            "float",
            "null"
          ]
        },
        {
          "name": "PJ",
          "type": [
            "float",
            "null"
          ]
        },
        {
          "name": "GJ",
          "type": [
            "float",
            "null"
          ]
        },
        {
          "name": "QJ",
          "type": [
            "float",
            "null"
          ]
        },
        {
          "name": "RJ",
          "type": [
            "float",
            "null"
          ]
        },
        {
          "name": "VJ",
          "type": [
            {
              "type": "array",
              "items": "float"
            },
            "null"
          ]
        },
        {
          "name": "MJ",
          "type": [
            {
              "type": "array",
              "items": "float"
            },
            "null"
          ]
        },
        {
          "name": "KJ",
          "type": [
            "float",
            "null"
          ]
        },
        {
          "name": "HJ",
          "type": [
            "float",
            "null"
          ]
        },
        {
          "name": "WJ",
          "type": [
            "float",
            "null"
          ]
        },
        {
          "name": "cL",
          "type": [
            "float",
            "null"
          ]
        },
        {
          "name": "tL",
          "type": [
            "float",
            "null"
          ]
        },
        {
          "name": "YL",
          "type": [
            "string"
          ]
        },
        {
          "name": "wL",
          "type": [
            "string"
          ]
        },
        {
          "name": "zB",
          "type": [
            "string"
          ]
        },
        {
          "name": "lL",
          "type": [
            "string"
          ]
        },
        {
          "name": "RL",
          "type": [
            "string"
          ]
        },
        {
          "name": "sL",
          "type": [
            "string"
          ]
        },
        {
          "name": "HL",
          "type": [
            "string"
          ]
        },
        {
          "name": "JB",
          "type": [
            "string"
          ]
        },
        {
          "name": "uL",
          "type": [
            "string"
          ]
        },
        {
          "name": "EL",
          "type": [
            "string"
          ]
        },
        {
          "name": "bedwars_tutorial_v1",
          "type": [
            "string"
          ]
        },
        {
          "name": "pirates_tutorial_v1",
          "type": [
            "string"
          ]
        },
        {
          "name": "tsunami_tutorial_v1",
          "type": [
            "string"
          ]
        },
        {
          "name": "containment_breach_thumbnail_v1",
          "type": [
            "string"
          ]
        },
        {
          "name": "ez_towering_v1",
          "type": [
            "string"
          ]
        },
        {
          "name": "skyblock_toll_v1",
          "type": [
            "string"
          ]
        },
        {
          "name": "webgl_holdback_v1",
          "type": [
            "string"
          ]
        },
        {
          "name": "intel_gen9_lite_v1",
          "type": [
            "string"
          ]
        },
        {
          "name": "wasm_holdback_v1",
          "type": [
            "string"
          ]
        },
        {
          "name": "nitro_ads_v1",
          "type": [
            "string"
          ]
        },
        {
          "name": "yN",
          "type": [
            "string"
          ]
        },
        {
          "name": "kN",
          "type": [
            "string"
          ]
        },
        {
          "name": "iN",
          "type": [
            "string"
          ]
        },
        {
          "name": "piF",
          "type": [
            "string"
          ]
        },
        {
          "name": "dJ",
          "type": [
            "string"
          ]
        },
        {
          "name": "Rf",
          "type": [
            "string"
          ]
        },
        {
          "name": "gL",
          "type": [
            "string"
          ]
        },
        {
          "name": "vN",
          "type": [
            "string"
          ]
        },
        {
          "name": "zN",
          "type": [
            "string"
          ]
        },
        {
          "name": "mN",
          "type": [
            "string"
          ]
        }
      ]
    }
  },
  {
    "id": 20,
    "schema": {
      "type": "record",
      "fields": [
        {
          "name": "sC",
          "type": "int"
        }
      ]
    }
  },
  {
    "id": 21,
    "schema": {
      "type": "record",
      "fields": [
        {
          "name": "ku",
          "type": [
            "null",
            {
              "type": "array",
              "items": "int"
            }
          ]
        },
        {
          "name": "Wy",
          "type": [
            "null",
            "string"
          ]
        },
        {
          "name": "gy",
          "type": {
            "type": "array",
            "items": "float"
          }
        },
        {
          "name": "Sy",
          "type": "int"
        },
        {
          "name": "Py",
          "type": "string"
        }
      ]
    }
  },
  {
    "id": 24,
    "schema": "string"
  },
  {
    "id": 25,
    "schema": "int"
  },
  {
    "id": 26,
    "schema": {
      "type": "record",
      "fields": [
        {
          "name": "Gw",
          "type": "int"
        },
        {
          "name": "Jw",
          "type": "int"
        }
      ]
    }
  },
  {
    "id": 29,
    "schema": {
      "type": "record",
      "fields": [
        {
          "name": "tR",
          "type": "int"
        },
        {
          "name": "zR",
          "type": "int"
        }
      ]
    }
  },
  {
    "id": 33,
    "schema": {
      "type": "record",
      "fields": [
        {
          "name": "Eu",
          "type": {
            "type": "array",
            "items": "int"
          }
        },
        {
          "name": "KV",
          "type": {
            "type": "array",
            "items": "int"
          }
        }
      ]
    }
  },
  {
    "id": 34,
    "schema": {
      "type": "record",
      "fields": [
        {
          "name": "Qu",
          "type": "string"
        },
        {
          "name": "YB",
          "type": {
            "type": "array",
            "items": "double"
          }
        },
        {
          "name": "CB",
          "type": {
            "type": "array",
            "items": "double"
          }
        }
      ]
    }
  },
  {
    "id": 35,
    "schema": {
      "type": "record",
      "fields": [
        {
          "name": "KD",
          "type": "int"
        },
        {
          "name": "uD",
          "type": "int"
        }
      ]
    }
  },
  {
    "id": 37,
    "schema": {
      "type": "record",
      "fields": [
        {
          "name": "tC",
          "type": {
            "type": "array",
            "items": "int"
          }
        },
        {
          "name": "Xu",
          "type": "int"
        },
        {
          "name": "Yu",
          "type": "int"
        }
      ]
    }
  },
  {
    "id": 38,
    "schema": {
      "type": "record",
      "fields": [
        {
          "name": "JC",
          "type": "string"
        },
        {
          "name": "yC",
          "type": [
            "null",
            "string"
          ]
        }
      ]
    }
  },
  {
    "id": 39,
    "schema": "double"
  },
  {
    "id": 40,
    "schema": {
      "type": "record",
      "fields": [
        {
          "name": "pC",
          "type": {
            "type": "array",
            "items": "double"
          }
        },
        {
          "name": "sC",
          "type": "int"
        },
        {
          "name": "gy",
          "type": {
            "type": "array",
            "items": "double"
          }
        }
      ]
    }
  },
  {
    "id": 41,
    "schema": {
      "type": "record",
      "fields": [
        {
          "name": "ku",
          "type": [
            "null",
            {
              "type": "array",
              "items": "int"
            }
          ]
        },
        {
          "name": "Wy",
          "type": [
            "null",
            "string"
          ]
        },
        {
          "name": "gy",
          "type": {
            "type": "array",
            "items": "float"
          }
        },
        {
          "name": "Sy",
          "type": "int"
        },
        {
          "name": "Py",
          "type": "string"
        }
      ]
    }
  },
  {
    "id": 43,
    "schema": {
      "type": "record",
      "fields": [
        {
          "name": "BR",
          "type": {
            "type": "array",
            "items": "int"
          }
        },
        {
          "name": "qD",
          "type": "int"
        },
        {
          "name": "qR",
          "type": "string"
        },
        {
          "name": "ZR",
          "type": "boolean"
        },
        {
          "name": "pR",
          "type": "boolean"
        },
        {
          "name": "AR",
          "type": "boolean"
        }
      ]
    }
  },
  {
    "id": 46,
    "schema": {
      "type": "record",
      "fields": [
        {
          "name": "KR",
          "type": "string"
        },
        {
          "name": "nR",
          "type": "string"
        }
      ]
    }
  },
  {
    "id": 49,
    "schema": {
      "type": "record",
      "fields": [
        {
          "name": "RR",
          "type": {
            "type": "array",
            "items": "int"
          }
        },
        {
          "name": "qD",
          "type": [
            "int"
          ]
        },
        {
          "name": "oD",
          "type": [
            "null",
            "int"
          ]
        }
      ]
    }
  },
  {
    "id": 52,
    "schema": {
      "type": "record",
      "fields": [
        {
          "name": "xR",
          "type": "string"
        },
        {
          "name": "oR",
          "type": [
            "null",
            "string"
          ]
        },
        {
          "name": "ZD",
          "type": "string"
        },
        {
          "name": "pD",
          "type": [
            "null",
            "string"
          ]
        }
      ]
    }
  },
  {
    "id": 54,
    "schema": {
      "type": "record",
      "fields": [
        {
          "name": "Qu",
          "type": "string"
        },
        {
          "name": "FY",
          "type": "string"
        },
        {
          "name": "JY",
          "type": "int"
        },
        {
          "name": "gy",
          "type": {
            "type": "array",
            "items": "double"
          }
        }
      ]
    }
  },
  {
    "id": 56,
    "schema": {
      "type": "record",
      "fields": [
        {
          "name": "ku",
          "type": [
            "null",
            {
              "type": "array",
              "items": "int"
            }
          ]
        },
        {
          "name": "Wy",
          "type": [
            "null",
            "string"
          ]
        },
        {
          "name": "gy",
          "type": {
            "type": "array",
            "items": "float"
          }
        },
        {
          "name": "Sy",
          "type": "int"
        },
        {
          "name": "Py",
          "type": "string"
        }
      ]
    }
  },
  {
    "id": 59,
    "schema": {
      "type": "record",
      "fields": [
        {
          "name": "Qu",
          "type": "string"
        }
      ]
    }
  },
  {
    "id": 60,
    "schema": {
      "type": "record",
      "fields": [
        {
          "name": "Ij",
          "type": "string"
        },
        {
          "name": "fj",
          "type": "string"
        }
      ]
    }
  },
  {
    "id": 61,
    "schema": {
      "type": "record",
      "fields": [
        {
          "name": "Tn",
          "type": "string"
        },
        {
          "name": "hu",
          "type": [
            "null",
            "string"
          ]
        }
      ]
    }
  },
  {
    "id": 62,
    "schema": "boolean"
  },
  {
    "id": 64,
    "schema": "string"
  },
  {
    "id": 65,
    "schema": {
      "type": "record",
      "fields": [
        {
          "name": "Mj",
          "type": "int"
        },
        {
          "name": "mR",
          "type": "int"
        },
        {
          "name": "dj",
          "type": "int"
        }
      ]
    }
  },
  {
    "id": 67,
    "schema": {
      "name": "dJ",
      "type": "record",
      "fields": [
        {
          "name": "Qr",
          "type": {
            "type": "array",
            "items": "int"
          }
        },
        {
          "name": "Ur",
          "type": "string"
        },
        {
          "name": "gy",
          "type": {
            "type": "array",
            "items": "double"
          }
        }
      ]
    }
  },
  {
    "id": 69,
    "schema": "int"
  },
  {
    "id": 70,
    "schema": {
      "type": "record",
      "fields": [
        {
          "name": "ku",
          "type": [
            "null",
            {
              "type": "array",
              "items": "int"
            }
          ]
        },
        {
          "name": "Wy",
          "type": [
            "null",
            "string"
          ]
        },
        {
          "name": "gy",
          "type": {
            "type": "array",
            "items": "float"
          }
        },
        {
          "name": "Sy",
          "type": "int"
        },
        {
          "name": "Py",
          "type": "string"
        }
      ]
    }
  },
  {
    "id": 73,
    "schema": {
      "type": "record",
      "fields": [
        {
          "name": "id",
          "type": "int"
        },
        {
          "name": "MV",
          "type": "boolean"
        }
      ]
    }
  },
  {
    "id": 76,
    "schema": {
      "type": "record",
      "fields": [
        {
          "name": "Wj",
          "type": "int"
        },
        {
          "name": "bj",
          "type": "int"
        }
      ]
    }
  },
  {
    "id": 78,
    "schema": {
      "type": "record",
      "fields": [
        {
          "name": "IR",
          "type": {
            "type": "array",
            "items": "int"
          }
        }
      ]
    }
  },
  {
    "id": 79,
    "schema": {
      "type": "record",
      "fields": [
        {
          "name": "iC",
          "type": {
            "type": "array",
            "items": "int"
          }
        },
        {
          "name": "DR",
          "type": "string"
        },
        {
          "name": "jC",
          "type": "int"
        }
      ]
    }
  },
  {
    "id": 80,
    "schema": {
      "type": "record",
      "fields": [
        {
          "name": "Sj",
          "type": [
            "null",
            "string"
          ]
        }
      ]
    }
  },
  {
    "id": 84,
    "schema": {
      "type": "record",
      "fields": [
        {
          "name": "ku",
          "type": [
            "null",
            {
              "type": "array",
              "items": "int"
            }
          ]
        },
        {
          "name": "Wy",
          "type": [
            "null",
            "string"
          ]
        },
        {
          "name": "gy",
          "type": {
            "type": "array",
            "items": "float"
          }
        },
        {
          "name": "Sy",
          "type": "int"
        },
        {
          "name": "Py",
          "type": "string"
        }
      ]
    }
  },
  {
    "id": 87,
    "schema": {
      "type": "record",
      "fields": [
        {
          "name": "hj",
          "type": "double"
        },
        {
          "name": "Jj",
          "type": "double"
        },
        {
          "name": "yj",
          "type": "double"
        },
        {
          "name": "Uj",
          "type": "double"
        },
        {
          "name": "wj",
          "type": "double"
        },
        {
          "name": "vj",
          "type": "double"
        },
        {
          "name": "uj",
          "type": "double"
        },
        {
          "name": "Kj",
          "type": "double"
        },
        {
          "name": "Ej",
          "type": "double"
        },
        {
          "name": "Qj",
          "type": "double"
        }
      ]
    }
  },
  {
    "id": 88,
    "schema": {
      "type": "record",
      "fields": [
        {
          "name": "Yj",
          "type": "int"
        },
        {
          "name": "Nj",
          "type": {
            "type": "array",
            "items": "int"
          }
        },
        {
          "name": "Vj",
          "type": "int"
        }
      ]
    }
  },
  {
    "id": 90,
    "schema": {
      "type": "record",
      "fields": [
        {
          "name": "sA",
          "type": {
            "type": "array",
            "items": "int"
          }
        },
        {
          "name": "xV",
          "type": "int"
        }
      ]
    }
  },
  {
    "id": 91,
    "schema": {
      "type": "record",
      "fields": [
        {
          "name": "Ai",
          "type": "boolean"
        },
        {
          "name": "uR",
          "type": "long"
        }
      ]
    }
  },
  {
    "id": 92,
    "schema": {
      "type": "record",
      "fields": [
        {
          "name": "Tn",
          "type": "string"
        },
        {
          "name": "hu",
          "type": [
            "null",
            "string"
          ]
        }
      ]
    }
  },
  {
    "id": 93,
    "schema": "int"
  },
  {
    "id": 94,
    "schema": {
      "type": "record",
      "fields": [
        {
          "name": "cC",
          "type": "string"
        },
        {
          "name": "tickCounter",
          "type": "int"
        },
        {
          "name": "LC",
          "type": {
            "type": "array",
            "items": "double"
          }
        },
        {
          "name": "PC",
          "type": {
            "type": "array",
            "items": {
              "name": "OC",
              "type": "record",
              "fields": [
                {
                  "name": "fD",
                  "type": [
                    "null",
                    "string"
                  ]
                },
                {
                  "name": "kT",
                  "type": {
                    "type": "array",
                    "items": "float"
                  }
                },
                {
                  "name": "vt",
                  "type": "double"
                },
                {
                  "name": "WC",
                  "type": [
                    "null",
                    "string"
                  ]
                }
              ]
            }
          }
        }
      ]
    }
  },
  {
    "id": 95,
    "schema": {
      "type": "record",
      "fields": [
        {
          "name": "zK",
          "type": "string"
        }
      ]
    }
  },
  {
    "id": 96,
    "schema": {
      "type": "record",
      "fields": [
        {
          "name": "wR",
          "type": {
            "type": "array",
            "items": "string"
          }
        },
        {
          "name": "vR",
          "type": "string"
        },
        {
          "name": "eR",
          "type": "boolean"
        }
      ]
    }
  },
  {
    "id": 97,
    "schema": {
      "type": "record",
      "fields": [
        {
          "name": "SR",
          "type": "string"
        },
        {
          "name": "ED",
          "type": {
            "type": "array",
            "items": "float"
          }
        },
        {
          "name": "SD",
          "type": [
            "null",
            "string"
          ]
        }
      ]
    }
  },
  {
    "id": 98,
    "schema": "boolean"
  },
  {
    "id": 99,
    "schema": {
      "type": "record",
      "fields": [
        {
          "name": "Eu",
          "type": {
            "type": "array",
            "items": "int"
          }
        },
        {
          "name": "KV",
          "type": {
            "type": "array",
            "items": "int"
          }
        }
      ]
    }
  },
  {
    "id": 102,
    "schema": "string"
  },
  {
    "id": 103,
    "schema": {
      "type": "record",
      "fields": [
        {
          "name": "UC",
          "type": "string"
        },
        {
          "name": "wC",
          "type": [
            "null",
            "long"
          ]
        },
        {
          "name": "vC",
          "type": [
            "null",
            "string"
          ]
        },
        {
          "name": "eC",
          "type": "string"
        },
        {
          "name": "uC",
          "type": "int"
        }
      ]
    }
  },
  {
    "id": 104,
    "schema": "double"
  },
  {
    "id": 105,
    "schema": {
      "type": "record",
      "fields": [
        {
          "name": "dD",
          "type": "int"
        },
        {
          "name": "hD",
          "type": "boolean"
        },
        {
          "name": "JD",
          "type": "int"
        }
      ]
    }
  },
  {
    "id": 107,
    "schema": {
      "type": "record",
      "fields": [
        {
          "name": "aC",
          "type": "string"
        },
        {
          "name": "NC",
          "type": [
            "null",
            "string"
          ]
        },
        {
          "name": "ED",
          "type": {
            "type": "array",
            "items": "float"
          }
        },
        {
          "name": "SD",
          "type": [
            "null",
            "string"
          ]
        },
        {
          "name": "VC",
          "type": "int"
        },
        {
          "name": "mT",
          "type": "int"
        },
        {
          "name": "dC",
          "type": "int"
        }
      ]
    }
  },
  {
    "id": 109,
    "schema": {
      "type": "record",
      "fields": [
        {
          "name": "Oj",
          "type": "string"
        },
        {
          "name": "kR",
          "type": "int"
        },
        {
          "name": "Xj",
          "type": "boolean"
        }
      ]
    }
  },
  {
    "id": 111,
    "schema": {
      "type": "record",
      "fields": [
        {
          "name": "CR",
          "type": "double"
        },
        {
          "name": "sR",
          "type": "double"
        },
        {
          "name": "cR",
          "type": "double"
        },
        {
          "name": "LR",
          "type": "double"
        },
        {
          "name": "PR",
          "type": "double"
        },
        {
          "name": "OR",
          "type": "double"
        },
        {
          "name": "kC",
          "type": "boolean"
        },
        {
          "name": "XR",
          "type": "boolean"
        },
        {
          "name": "WR",
          "type": "double"
        },
        {
          "name": "bR",
          "type": "boolean"
        },
        {
          "name": "YR",
          "type": {
            "type": "array",
            "items": "double"
          }
        },
        {
          "name": "rR",
          "type": {
            "type": "array",
            "items": "double"
          }
        },
        {
          "name": "aR",
          "type": "int"
        },
        {
          "name": "NR",
          "type": {
            "type": "array",
            "items": "double"
          }
        },
        {
          "name": "VR",
          "type": "boolean"
        },
        {
          "name": "MR",
          "type": "string"
        }
      ]
    }
  },
  {
    "id": 114,
    "schema": {
      "type": "record",
      "fields": [
        {
          "name": "a",
          "type": "string"
        },
        {
          "name": "b",
          "type": "string"
        },
        {
          "name": "c",
          "type": "string"
        },
        {
          "name": "d",
          "type": [
            "null",
            "double"
          ]
        },
        {
          "name": "e",
          "type": [
            "null",
            "double"
          ]
        },
        {
          "name": "f",
          "type": [
            "null",
            "double"
          ]
        },
        {
          "name": "g",
          "type": [
            "null",
            "double"
          ]
        },
        {
          "name": "h",
          "type": [
            "null",
            "double"
          ]
        },
        {
          "name": "i",
          "type": [
            "null",
            "double"
          ]
        },
        {
          "name": "j",
          "type": [
            "null",
            "double"
          ]
        },
        {
          "name": "k",
          "type": [
            "null",
            "double"
          ]
        },
        {
          "name": "l",
          "type": [
            "null",
            "double"
          ]
        },
        {
          "name": "m",
          "type": [
            "null",
            "double"
          ]
        },
        {
          "name": "n",
          "type": [
            "null",
            "double"
          ]
        }
      ]
    }
  },
  {
    "id": 115,
    "schema": {
      "type": "record",
      "fields": [
        {
          "name": "KC",
          "type": "int"
        },
        {
          "name": "nC",
          "type": "int"
        },
        {
          "name": "RD",
          "type": "int"
        }
      ]
    }
  },
  {
    "id": 117,
    "schema": {
      "type": "record",
      "fields": [
        {
          "name": "CC",
          "type": "string"
        },
        {
          "name": "TC",
          "type": "int"
        },
        {
          "name": "HC",
          "type": "int"
        }
      ]
    }
  },
  {
    "id": 118,
    "schema": {
      "type": "record",
      "fields": [
        {
          "name": "ku",
          "type": [
            "null",
            {
              "type": "array",
              "items": "int"
            }
          ]
        },
        {
          "name": "Wy",
          "type": [
            "null",
            "string"
          ]
        },
        {
          "name": "gy",
          "type": {
            "type": "array",
            "items": "float"
          }
        },
        {
          "name": "Sy",
          "type": "int"
        },
        {
          "name": "Py",
          "type": "string"
        }
      ]
    }
  },
  {
    "id": 119,
    "schema": {
      "type": "record",
      "fields": [
        {
          "name": "qj",
          "type": "string"
        }
      ]
    }
  },
  {
    "id": 120,
    "schema": {
      "type": "record",
      "fields": [
        {
          "name": "ku",
          "type": [
            "null",
            {
              "type": "array",
              "items": "int"
            }
          ]
        },
        {
          "name": "Wy",
          "type": [
            "null",
            "string"
          ]
        },
        {
          "name": "gy",
          "type": {
            "type": "array",
            "items": "float"
          }
        },
        {
          "name": "Sy",
          "type": "int"
        },
        {
          "name": "Py",
          "type": "string"
        }
      ]
    }
  },
  {
    "id": 121,
    "schema": {
      "type": "array",
      "items": "int"
    }
  },
  {
    "id": 123,
    "schema": {
      "type": "record",
      "fields": [
        {
          "name": "KD",
          "type": "string"
        },
        {
          "name": "oD",
          "type": [
            "null",
            "int"
          ]
        }
      ]
    }
  },
  {
    "id": 124,
    "schema": {
      "type": "record",
      "fields": [
        {
          "name": "Wm",
          "type": "string"
        },
        {
          "name": "qY",
          "type": "string"
        }
      ]
    }
  }
];
const INBOUND_IDS = {
  "SPacketInbound0": 0,
  "SPacketRemoveItem": 3,
  "SPacketInbound4": 4,
  "SPacketInbound6": 6,
  "SPacketInbound7": 7,
  "SPacketBlockUpdate10": 8,
  "SPacketInbound9": 9,
  "SPacketEffectMultiplier": 11,
  "SPacketInbound12": 12,
  "SPacketUpdateSpeed": 13,
  "SPacketLogError": 15,
  "SPacketInbound17": 17,
  "SPacketPlayerTeleport": 18,
  "SPacketInbound22": 22,
  "SPacketChunkData": 24,
  "SPacketParticles": 25,
  "SPacketBulletFire": 29,
  "SPacketInbound30": 30,
  "SPacketViewAngles": 31,
  "SPacketRegisterCustomItem": 32,
  "SPacketInbound33": 33,
  "SPacketInbound34": 34,
  "SPacketInbound35": 35,
  "SPacketSetBlock": 36,
  "SPacketInbound37": 37,
  "SPacketInbound40": 40,
  "SPacketInbound42": 42,
  "SPacketEntityDamage": 45,
  "SPacketInbound46": 46,
  "SPacketSetBlock3": 50,
  "SPacketBulletHit": 53,
  "SPacketInbound54": 54,
  "SPacketInbound56": 56,
  "SPacketInbound57": 57,
  "SPacketInbound58": 58,
  "SPacketServerSetting": 59,
  "SPacketPlaySound": 60,
  "SPacketInbound63": 63,
  "SPacketJoinGame": 64,
  "SPacketInbound65": 65,
  "SPacketInbound68": 68,
  "SPacketOpenShop": 72,
  "SPacketInbound74": 74,
  "SPacketInbound75": 75,
  "SPacketInbound76": 76,
  "SPacketSetPickupFalse": 77,
  "SPacketUpdateChest": 81,
  "SPacketInbound82": 82,
  "SPacketInbound83": 83,
  "SPacketInbound87": 87,
  "SPacketUpdateEffect": 88,
  "SPacketSetMultiBlock": 89,
  "SPacketSetPickupTrue": 90,
  "SPacketSyncInventory": 91,
  "SPacketEntityVelocityPlayer": 92,
  "SPacketInbound94": 94,
  "SPacketSetBlock2": 97,
  "SPacketInbound100": 100,
  "SPacketInbound102": 102,
  "SPacketRemoveEffect": 103,
  "SPacketInbound104": 104,
  "SPacketSelectSlot": 105,
  "SPacketInbound107": 107,
  "SPacketEntityVelocity": 109,
  "SPacketInbound111": 111,
  "SPacketInbound113": 113,
  "SPacketInbound114": 114,
  "SPacketInbound115": 115,
  "SPacketInbound116": 116,
  "SPacketInbound117": 117,
  "SPacketInbound118": 118,
  "SPacketQueueNext": 121,
  "SPacketInbound122": 122,
  "SPacketInbound124": 124
};
const INBOUND_HANDLER_IDS = {
  "SPacketInbound0": 0,
  "SPacketHandler1": 1,
  "SPacketRemoveItem": 3,
  "SPacketInbound4": 4,
  "SPacketPlayerKilled": 5,
  "SPacketInbound6": 6,
  "SPacketInbound7": 7,
  "SPacketBlockUpdate10": 8,
  "SPacketHandler10": 10,
  "SPacketEffectMultiplier": 11,
  "SPacketInbound12": 12,
  "SPacketUpdateSpeed": 13,
  "SPacketLogError": 15,
  "SPacketHandler16": 16,
  "SPacketInbound17": 17,
  "SPacketPlayerTeleport": 18,
  "SPacketHandler20": 20,
  "SPacketHandler21": 21,
  "SPacketInbound22": 22,
  "SPacketChunkData": 24,
  "SPacketParticles": 25,
  "SPacketSetBlockData": 26,
  "SPacketHandler28": 28,
  "SPacketBulletFire": 29,
  "SPacketInbound30": 30,
  "SPacketViewAngles": 31,
  "SPacketRegisterCustomItem": 32,
  "SPacketInbound33": 33,
  "SPacketInbound34": 34,
  "SPacketInbound35": 35,
  "SPacketSetBlock": 36,
  "SPacketInbound37": 37,
  "SPacketHandler39": 39,
  "SPacketInbound40": 40,
  "SPacketHandler41": 41,
  "SPacketInbound42": 42,
  "SPacketHandler44": 44,
  "SPacketEntityDamage": 45,
  "SPacketInbound46": 46,
  "SPacketTopRight": 47,
  "SPacketHandler49": 49,
  "SPacketSetBlock3": 50,
  "SPacketClearInventory": 51,
  "SPacketBulletHit": 53,
  "SPacketInbound54": 54,
  "SPacketInbound56": 56,
  "SPacketInbound57": 57,
  "SPacketInbound58": 58,
  "SPacketServerSetting": 59,
  "SPacketPlaySound": 60,
  "SPacketInbound63": 63,
  "SPacketJoinGame": 64,
  "SPacketInbound65": 65,
  "SPacketInbound68": 68,
  "SPacketHandler69": 69,
  "SPacketHandler71": 71,
  "SPacketOpenShop": 72,
  "SPacketHandler73": 73,
  "SPacketInbound74": 74,
  "SPacketInbound75": 75,
  "SPacketInbound76": 76,
  "SPacketSetPickupFalse": 77,
  "SPacketPickupItem": 78,
  "SPacketHandler80": 80,
  "SPacketUpdateChest": 81,
  "SPacketInbound82": 82,
  "SPacketInbound83": 83,
  "SPacketInbound87": 87,
  "SPacketUpdateEffect": 88,
  "SPacketSetMultiBlock": 89,
  "SPacketSetPickupTrue": 90,
  "SPacketSyncInventory": 91,
  "SPacketEntityVelocityPlayer": 92,
  "SPacketSetSlot": 93,
  "SPacketKillfeed": 96,
  "SPacketSetBlock2": 97,
  "SPacketHandler98": 98,
  "SPacketInbound100": 100,
  "SPacketInbound102": 102,
  "SPacketRemoveEffect": 103,
  "SPacketInbound104": 104,
  "SPacketSelectSlot": 105,
  "SPacketEntitySetting": 106,
  "SPacketInbound107": 107,
  "SPacketEntityVelocity": 109,
  "SPacketInbound111": 111,
  "SPacketHandler112": 112,
  "SPacketInbound113": 113,
  "SPacketInbound114": 114,
  "SPacketInbound115": 115,
  "SPacketInbound116": 116,
  "SPacketInbound117": 117,
  "SPacketInbound118": 118,
  "SPacketHandler119": 119,
  "SPacketHandler120": 120,
  "SPacketInbound122": 122,
  "SPacketInbound124": 124,
  "SPacketChat": 125,
  "SPacketHandler126": 126,
  "SPacketHandler127": 127
};
const INBOUND_JSON = {
  "SPacketHandler1": {
    "id": 1,
    "map": null,
    "evidence": "generated/inbound-ids.json#handlerWithoutSchemaIds"
  },
  "SPacketPlayerKilled": {
    "id": 5,
    "map": null,
    "evidence": "mapping.json#inbound.SPacketPlayerKilled;generated/inbound-ids.json#handlerWithoutSchemaIds"
  },
  "SPacketHandler10": {
    "id": 10,
    "map": null,
    "evidence": "generated/inbound-ids.json#handlerWithoutSchemaIds"
  },
  "SPacketHandler16": {
    "id": 16,
    "map": null,
    "evidence": "generated/inbound-ids.json#handlerWithoutSchemaIds"
  },
  "SPacketHandler20": {
    "id": 20,
    "map": null,
    "evidence": "generated/inbound-ids.json#handlerWithoutSchemaIds"
  },
  "SPacketHandler21": {
    "id": 21,
    "map": null,
    "evidence": "generated/inbound-ids.json#handlerWithoutSchemaIds"
  },
  "SPacketSetBlockData": {
    "id": 26,
    "map": null,
    "evidence": "mapping.json#inbound.SPacketSetBlockData;generated/inbound-ids.json#handlerWithoutSchemaIds"
  },
  "SPacketHandler28": {
    "id": 28,
    "map": null,
    "evidence": "generated/inbound-ids.json#handlerWithoutSchemaIds"
  },
  "SPacketHandler39": {
    "id": 39,
    "map": null,
    "evidence": "generated/inbound-ids.json#handlerWithoutSchemaIds"
  },
  "SPacketHandler41": {
    "id": 41,
    "map": null,
    "evidence": "generated/inbound-ids.json#handlerWithoutSchemaIds"
  },
  "SPacketHandler44": {
    "id": 44,
    "map": null,
    "evidence": "generated/inbound-ids.json#handlerWithoutSchemaIds"
  },
  "SPacketTopRight": {
    "id": 47,
    "map": null,
    "evidence": "mapping.json#inbound.SPacketTopRight;generated/inbound-ids.json#handlerWithoutSchemaIds"
  },
  "SPacketHandler49": {
    "id": 49,
    "map": null,
    "evidence": "generated/inbound-ids.json#handlerWithoutSchemaIds"
  },
  "SPacketClearInventory": {
    "id": 51,
    "map": null,
    "evidence": "mapping.json#inbound.SPacketClearInventory;generated/inbound-ids.json#handlerWithoutSchemaIds"
  },
  "SPacketHandler69": {
    "id": 69,
    "map": null,
    "evidence": "generated/inbound-ids.json#handlerWithoutSchemaIds"
  },
  "SPacketHandler71": {
    "id": 71,
    "map": null,
    "evidence": "generated/inbound-ids.json#handlerWithoutSchemaIds"
  },
  "SPacketHandler73": {
    "id": 73,
    "map": null,
    "evidence": "generated/inbound-ids.json#handlerWithoutSchemaIds"
  },
  "SPacketPickupItem": {
    "id": 78,
    "map": null,
    "evidence": "mapping.json#inbound.SPacketPickupItem;generated/inbound-ids.json#handlerWithoutSchemaIds"
  },
  "SPacketHandler80": {
    "id": 80,
    "map": null,
    "evidence": "generated/inbound-ids.json#handlerWithoutSchemaIds"
  },
  "SPacketSetSlot": {
    "id": 93,
    "map": null,
    "evidence": "mapping.json#inbound.SPacketSetSlot;generated/inbound-ids.json#handlerWithoutSchemaIds"
  },
  "SPacketKillfeed": {
    "id": 96,
    "map": null,
    "evidence": "mapping.json#inbound.SPacketKillfeed;generated/inbound-ids.json#handlerWithoutSchemaIds"
  },
  "SPacketHandler98": {
    "id": 98,
    "map": null,
    "evidence": "generated/inbound-ids.json#handlerWithoutSchemaIds"
  },
  "SPacketEntitySetting": {
    "id": 106,
    "map": null,
    "evidence": "mapping.json#inbound.SPacketEntitySetting;generated/inbound-ids.json#handlerWithoutSchemaIds"
  },
  "SPacketHandler112": {
    "id": 112,
    "map": null,
    "evidence": "generated/inbound-ids.json#handlerWithoutSchemaIds"
  },
  "SPacketHandler119": {
    "id": 119,
    "map": null,
    "evidence": "generated/inbound-ids.json#handlerWithoutSchemaIds"
  },
  "SPacketHandler120": {
    "id": 120,
    "map": null,
    "evidence": "generated/inbound-ids.json#handlerWithoutSchemaIds"
  },
  "SPacketChat": {
    "id": 125,
    "map": null,
    "evidence": "mapping.json#inbound.SPacketChat;generated/inbound-ids.json#handlerWithoutSchemaIds"
  },
  "SPacketHandler126": {
    "id": 126,
    "map": null,
    "evidence": "generated/inbound-ids.json#handlerWithoutSchemaIds"
  },
  "SPacketHandler127": {
    "id": 127,
    "map": null,
    "evidence": "generated/inbound-ids.json#handlerWithoutSchemaIds"
  }
};

const OUTBOUND_IDS = {
  "CPacketUseBoat": 1,
  "CPacketOutbound2": 2,
  "CPacketOutbound4": 4,
  "CPacketMoveItemAmount": 5,
  "CPacketSwingItem": 6,
  "CPacketCallSite7": 7,
  "CPacketTickEventDetection": 8,
  "CPacketMoveItemQuick": 9,
  "CPacketMoveItem": 10,
  "CPacketOutbound13": 13,
  "CPacketOutbound14": 14,
  "CPacketOutbound16": 16,
  "CPacketOutbound17": 17,
  "CPacketKillDetection": 20,
  "CPacketOutbound21": 21,
  "CPacketOutbound24": 24,
  "CPacketKeepAliveDetection": 25,
  "CPacketOutbound26": 26,
  "CPacketAcceptTeleport": 29,
  "CPacketOutbound33": 33,
  "CPacketOutbound34": 34,
  "CPacketOutbound35": 35,
  "CPacketOutbound37": 37,
  "CPacketChat": 38,
  "CPacketOutbound39": 39,
  "CPacketOutbound40": 40,
  "CPacketOutbound41": 41,
  "CPacketModifyBlock": 43,
  "CPacketShopPurchase": 45,
  "CPacketUpdateSkin": 46,
  "CPacketFillBucket": 49,
  "CPacketReportPlayer": 52,
  "CPacketOutbound54": 54,
  "CPacketCallSite55": 55,
  "CPacketOutbound56": 56,
  "CPacketOutbound59": 59,
  "CPacketJoinDiscord": 60,
  "CPacketOutbound61": 61,
  "CPacketOutbound62": 62,
  "CPacketOutbound64": 64,
  "CPacketRemoveItem2": 65,
  "CPacketOutbound67": 67,
  "CPacketHookDetection": 69,
  "CPacketOutbound70": 70,
  "CPacketCallSite71": 71,
  "CPacketOutbound73": 73,
  "CPacketSalvageItem": 76,
  "CPacketUseBucket": 78,
  "CPacketUpdateSignLines": 79,
  "CPacketRest": 80,
  "CPacketOutbound84": 84,
  "CPacketSimulationDetection": 87,
  "CPacketEnchantItem": 88,
  "CPacketOutbound90": 90,
  "CPacketFinishUse": 91,
  "CPacketOutbound92": 92,
  "CPacketSelectSlot": 93,
  "CPacketFireBullet": 94,
  "CPacketOutbound95": 95,
  "CPacketWriteBook": 96,
  "CPacketBreakEntity": 97,
  "CPacketOutbound98": 98,
  "CPacketOutbound99": 99,
  "CPacketOutbound102": 102,
  "CPacketRequestChunk": 103,
  "CPacketAnalytics": 104,
  "CPacketBaseEventDetection": 105,
  "CPacketAttackEntity": 107,
  "CPacketPickupItem": 109,
  "CPacketMovePlayer": 111,
  "CPacketCallSite112": 112,
  "CPacketOutbound114": 114,
  "CPacketRemoveItem": 115,
  "CPacketCloseChest": 116,
  "CPacketCraftItem": 117,
  "CPacketOutbound118": 118,
  "CPacketIgnorePlayer": 119,
  "CPacketOutbound120": 120,
  "CPacketBreakBlock": 121,
  "CPacketMilkEntity": 123,
  "CPacketOutbound124": 124,
  "CPacketReloadGun": 111,
  "CPacketResponseDetection": 105
};
const OUTBOUND_CALL_SITE_IDS = {
  "CPacketUseBoat": 1,
  "CPacketOutbound2": 2,
  "CPacketOutbound4": 4,
  "CPacketMoveItemAmount": 5,
  "CPacketSwingItem": 6,
  "CPacketCallSite7": 7,
  "CPacketTickEventDetection": 8,
  "CPacketMoveItemQuick": 9,
  "CPacketMoveItem": 10,
  "CPacketOutbound14": 14,
  "CPacketOutbound16": 16,
  "CPacketOutbound17": 17,
  "CPacketKillDetection": 20,
  "CPacketOutbound24": 24,
  "CPacketKeepAliveDetection": 25,
  "CPacketOutbound26": 26,
  "CPacketAcceptTeleport": 29,
  "CPacketOutbound33": 33,
  "CPacketOutbound34": 34,
  "CPacketOutbound35": 35,
  "CPacketOutbound37": 37,
  "CPacketChat": 38,
  "CPacketOutbound39": 39,
  "CPacketOutbound40": 40,
  "CPacketModifyBlock": 43,
  "CPacketShopPurchase": 45,
  "CPacketUpdateSkin": 46,
  "CPacketFillBucket": 49,
  "CPacketReportPlayer": 52,
  "CPacketOutbound54": 54,
  "CPacketCallSite55": 55,
  "CPacketOutbound59": 59,
  "CPacketJoinDiscord": 60,
  "CPacketOutbound62": 62,
  "CPacketOutbound64": 64,
  "CPacketRemoveItem2": 65,
  "CPacketOutbound67": 67,
  "CPacketHookDetection": 69,
  "CPacketCallSite71": 71,
  "CPacketOutbound73": 73,
  "CPacketSalvageItem": 76,
  "CPacketUseBucket": 78,
  "CPacketUpdateSignLines": 79,
  "CPacketRest": 80,
  "CPacketSimulationDetection": 87,
  "CPacketEnchantItem": 88,
  "CPacketOutbound90": 90,
  "CPacketFinishUse": 91,
  "CPacketSelectSlot": 93,
  "CPacketFireBullet": 94,
  "CPacketOutbound95": 95,
  "CPacketWriteBook": 96,
  "CPacketBreakEntity": 97,
  "CPacketOutbound99": 99,
  "CPacketOutbound102": 102,
  "CPacketRequestChunk": 103,
  "CPacketAnalytics": 104,
  "CPacketBaseEventDetection": 105,
  "CPacketAttackEntity": 107,
  "CPacketPickupItem": 109,
  "CPacketMovePlayer": 111,
  "CPacketCallSite112": 112,
  "CPacketRemoveItem": 115,
  "CPacketCloseChest": 116,
  "CPacketCraftItem": 117,
  "CPacketIgnorePlayer": 119,
  "CPacketBreakBlock": 121,
  "CPacketMilkEntity": 123,
  "CPacketReloadGun": 111,
  "CPacketResponseDetection": 105
};
const OUTBOUND_JSON = {
  "CPacketCallSite7": {
    "id": 7,
    "map": null,
    "evidence": "generated/outbound-ids.json#callSiteWithoutSchemaIds"
  },
  "CPacketShopPurchase": {
    "id": 45,
    "map": null,
    "evidence": "generated/outbound-ids.json#callSiteWithoutSchemaIds"
  },
  "CPacketCallSite55": {
    "id": 55,
    "map": null,
    "evidence": "generated/outbound-ids.json#callSiteWithoutSchemaIds"
  },
  "CPacketCallSite71": {
    "id": 71,
    "map": null,
    "evidence": "generated/outbound-ids.json#callSiteWithoutSchemaIds"
  },
  "CPacketCallSite112": {
    "id": 112,
    "map": null,
    "evidence": "generated/outbound-ids.json#callSiteWithoutSchemaIds"
  },
  "CPacketCloseChest": {
    "id": 116,
    "map": null,
    "evidence": "generated/outbound-ids.json#callSiteWithoutSchemaIds"
  }
};

// Explicit duplicate-id aliases. Both names share the same generated codec.
const OUTBOUND_ALIASES = {"CPacketReloadGun":"CPacketMovePlayer","CPacketResponseDetection":"CPacketBaseEventDetection"};
// JSON call-site aliases share the same no-schema transport path.
const OUTBOUND_JSON_ALIASES = {};

// Existing handler sends that have no evidence-backed 854 wire packet. These
// are ledger decisions, not silent drops: BloxClient records a typed
// unsupported error and sends no bytes.
const OUTBOUND_UNSUPPORTED = Object.freeze({
  "CPacketGravityDetection": "no 853 outbound call site carries a gravity constant",
  "CPacketConstantDetection": "853 has no captured schema or call site for the legacy detector payload",
  "CPacketConstantDetection2": "853 has no captured schema or call site for the legacy detector payload",
  "CPacketConstantDetection3": "853 has no captured schema or call site for the legacy detector payload",
  "CPacketConstantDetection4": "853 has no captured schema or call site for the legacy detector payload",
  "CPacketConstantDetection5": "853 has no captured schema or call site for the legacy detector payload",
  "CPacketConstantDetection6": "853 has no captured schema or call site for the legacy detector payload",
  "CPacketConstantDetection7": "853 has no captured schema or call site for the legacy detector payload",
  "CPacketConstantDetection8": "853 has no captured schema or call site for the legacy detector payload",
  "CPacketConstantDetection9": "853 has no captured schema or call site for the legacy detector payload",
  "CPacketConstantDetection10": "853 has no captured schema or call site for the legacy detector payload",
  "CPacketConstantDetection11": "853 has no captured schema or call site for the legacy detector payload",
  "CPacketUseItem": "explicitly unmapped in mapping.json: schema-only in both builds, byte-identical to a seven-member schema family with no distinguishing call site",
  "CPacketSpecialActionUp": "explicitly unmapped in mapping.json: schema-only in both builds, byte-identical to a seven-member schema family with no distinguishing call site",
  "CPacketRespawn": "853 has no resolved zero-argument respawn/start-use call site; the product never sent this name, so it is recorded instead of guessed",
  "CPacketStartUse": "853 has no resolved zero-argument respawn/start-use call site; the product never sent this name, so it is recorded instead of guessed"
});

// ---------------------------------------------------------------------------
// Codecs
// ---------------------------------------------------------------------------

const INBOUND_SCHEMAS = {};
for (const entry of INBOUND_SCHEMA_EVIDENCE) {
  const name = Object.keys(INBOUND_IDS).find((key) => INBOUND_IDS[key] === entry.id);
  if (!name) throw new Error('Missing inbound semantic name for schema id ' + entry.id);
  INBOUND_SCHEMAS[name] = Type.forSchema(entry.schema);
}

const OUTBOUND_SCHEMAS = {};
for (const entry of OUTBOUND_SCHEMA_EVIDENCE) {
  const name = Object.keys(OUTBOUND_IDS).find((key) => OUTBOUND_IDS[key] === entry.id && !OUTBOUND_JSON[key]);
  if (!name) throw new Error('Missing outbound semantic name for schema id ' + entry.id);
  OUTBOUND_SCHEMAS[name] = Type.forSchema(entry.schema);
}

for (const [alias, base] of Object.entries(OUTBOUND_ALIASES)) {
  if (OUTBOUND_SCHEMAS[base]) OUTBOUND_SCHEMAS[alias] = OUTBOUND_SCHEMAS[base];
}

// ---------------------------------------------------------------------------
// Evidence-backed inbound field maps
// ---------------------------------------------------------------------------
// Generated avsc field names are minified. These maps expose the exact
// handler-facing semantic names while keeping the generated wire field names
// in one place. `element` maps each entry of an array payload.
const INBOUND_FIELD_MAPS = Object.freeze({
  SPacketEntityDamage: {
    eId: 'eH',
    hitInfo: 'uH',
    yourAttack: 'EH',
    kbParticles: 'nH',
    damageAmount: 'QH',
    damageAngle: 'xH',
    healthFrac: 'oH'
  },
  SPacketRemoveEffect: { lifeformId: 'Fj', name: 'zj', displayName: 'iR' },
  SPacketUpdateEffect: {
    lifeformId: 'Fj',
    name: 'zj',
    displayName: 'iR',
    icon: 'hT',
    duration: 'JT',
    level: 'yT'
  },
  SPacketPlayerTeleport: { id: 'aT', x: 'NT', y: 'VT', z: 'mH' },
  SPacketJoinGame: { eId: 'iL', pass: 'jL' },
  SPacketSetBlock: { pos: 'QC', newId: 'xC' },
  SPacketSetBlock3: {
    element: { pos: 'WL', actualId: 'bL', data: 'YL' }
  },
  SPacketSetBlock2: { pos: 'Us', newId: 'vs' },
  SPacketPlaySound: {
    namePrefix: 'xT',
    volume: 'soundVolume',
    rate: 'oT',
    posSettings: { from: 'GT', map: { playerIdOrPos: 'BT', volume: 'qT', pitch: 'ZT' } }
  },
  SPacketChunkData: {
    id: 'nT',
    cancelled: 'Ii',
    RLEArr: 'ET',
    sharedBlockData: 'sharedBlockData',
    light: 'QT'
  },
  SPacketRemoveItem: { name: 'CT', amt: 'TT' },
  SPacketUpdateChest: { open: 'Zs', contents: 'As' }
});

function mapInboundFields(spec, decoded) {
  if (!decoded || typeof decoded !== 'object') return decoded;
  if (spec.element) return Array.isArray(decoded) ? decoded.map((entry) => mapInboundFields(spec.element, entry)) : decoded;
  const out = {};
  for (const [target, source] of Object.entries(spec)) {
    if (source && typeof source === 'object') {
      const raw = decoded[source.from];
      if (raw == null) {
        out[target] = raw;
      } else {
        const nested = {};
        for (const [nestedTarget, nestedSource] of Object.entries(source.map || {})) {
          nested[nestedTarget] = raw[nestedSource];
        }
        out[target] = nested;
      }
    } else {
      out[target] = decoded[source];
    }
  }
  return out;
}

const PROTOCOL_LEDGER = {
  "schemaVersion": 1,
  "build": "7rp1w",
  "buildVersion": "57cd8edd",
  "generatedManifestSha256": "ea70f18f94840eb4886735ac8777d2d7c6924d55d8bba7ad97a3fddb6fd80318",
  "evidence": {
    "build": "7rp1w",
    "buildVersion": "57cd8edd",
    "generatedManifestSha256": "ea70f18f94840eb4886735ac8777d2d7c6924d55d8bba7ad97a3fddb6fd80318",
    "generatedDir": ".research/7rp1w-audit/generated",
    "files": {
      "assets.json": {
        "bytes": 9873599,
        "sha256": "8d59114a0d85beea556e7d7e224f80f3c4ed7afc34e454b079974a39d13d6df8"
      },
      "inbound-ids.json": {
        "bytes": 2621,
        "sha256": "ab285fa1ff36b8ff9ca1bf1146c438cec3695d39b36d497c27e1aca3fe7ead88"
      },
      "inbound-schemas.json": {
        "bytes": 95709,
        "sha256": "cf5a7eb970c3ee9cc2a6f760bc360612876af39ef192dc4dc0d12dd2e0d15d63"
      },
      "inbound-semantics.json": {
        "bytes": 70948,
        "sha256": "b630e15fa3d00c1ad73eb5c4999e45bdea508174ad32e7df5b8b0a819f9b2e69"
      },
      "outbound-call-sites.json": {
        "bytes": 23784,
        "sha256": "980a6f390c87d4072581f4d2ed46da908f21804303622b5f73386913b6791458"
      },
      "outbound-ids.json": {
        "bytes": 2357,
        "sha256": "408a17e3599ccc24aa5c187cd18def476baf90404b57fdc0f4839f6bd6047013"
      },
      "outbound-schemas.json": {
        "bytes": 40954,
        "sha256": "0bbe61c32e306757240340a58906aa27786a51feb539c1c3bce582f94e0ce1a6"
      },
      "registry.json": {
        "bytes": 4135681,
        "sha256": "607e137fe0cd36a143d004bcf8091a8a6a42c0f44a457ccd60df96b337d8c597"
      },
      "transport.json": {
        "bytes": 998,
        "sha256": "61be2a6ca4a5423fa0c3417da78480aa2a51883dc8479b2ce5d189075a7e1e05"
      }
    }
  },
  "counts": {
    "inboundIds": 71,
    "inboundSchemas": 74,
    "inboundHandlerIds": 100,
    "outboundIds": 75,
    "inboundRaw": 74,
    "inboundSchemaAccounted": 74,
    "inboundCanonical": 71,
    "inboundCanonicalHandled": 71,
    "inboundHandler": 100,
    "inboundSchemaOnly": 3,
    "inboundHandlerOnly": 29,
    "outboundRaw": 75,
    "outboundSchemaAccounted": 75,
    "outboundCallSite": 68,
    "outboundCallSiteIds": 68,
    "outboundCallSiteWithoutSchema": 6,
    "unaccounted": 0,
    "ambiguous": 0,
    "guessed": 0,
    "existingHandlerIdsUnsupported": 0
  },
  "duplicates": [
    {
      "direction": "outbound",
      "id": 111,
      "names": [
        "CPacketMovePlayer",
        "CPacketReloadGun"
      ],
      "resolution": "explicit-alias-list"
    },
    {
      "direction": "outbound",
      "id": 105,
      "names": [
        "CPacketBaseEventDetection",
        "CPacketResponseDetection"
      ],
      "resolution": "explicit-alias-list"
    }
  ],
  "inbound": [
    {
      "id": 0,
      "direction": "inbound",
      "name": "SPacketInbound0",
      "disposition": "implemented",
      "codec": "avsc",
      "schema": {
        "source": "generated/inbound-schemas.json",
        "id": 0
      },
      "evidence": "generated/inbound-schemas.json#0;generated/inbound-ids.json#handlerIds"
    },
    {
      "id": 3,
      "direction": "inbound",
      "name": "SPacketRemoveItem",
      "disposition": "implemented",
      "codec": "avsc",
      "schema": {
        "source": "generated/inbound-schemas.json",
        "id": 3
      },
      "evidence": "generated/inbound-schemas.json#3;generated/inbound-ids.json#handlerIds"
    },
    {
      "id": 4,
      "direction": "inbound",
      "name": "SPacketInbound4",
      "disposition": "implemented",
      "codec": "avsc",
      "schema": {
        "source": "generated/inbound-schemas.json",
        "id": 4
      },
      "evidence": "generated/inbound-schemas.json#4;generated/inbound-ids.json#handlerIds"
    },
    {
      "id": 6,
      "direction": "inbound",
      "name": "SPacketInbound6",
      "disposition": "implemented",
      "codec": "avsc",
      "schema": {
        "source": "generated/inbound-schemas.json",
        "id": 6
      },
      "evidence": "generated/inbound-schemas.json#6;generated/inbound-ids.json#handlerIds"
    },
    {
      "id": 7,
      "direction": "inbound",
      "name": "SPacketInbound7",
      "disposition": "implemented",
      "codec": "avsc",
      "schema": {
        "source": "generated/inbound-schemas.json",
        "id": 7
      },
      "evidence": "generated/inbound-schemas.json#7;generated/inbound-ids.json#handlerIds"
    },
    {
      "id": 8,
      "direction": "inbound",
      "name": "SPacketBlockUpdate10",
      "disposition": "implemented",
      "codec": "avsc",
      "schema": {
        "source": "generated/inbound-schemas.json",
        "id": 8
      },
      "evidence": "generated/inbound-schemas.json#8;generated/inbound-ids.json#handlerIds"
    },
    {
      "id": 9,
      "direction": "inbound",
      "name": "SPacketInbound9",
      "disposition": "ignored",
      "codec": "avsc",
      "schema": {
        "source": "generated/inbound-schemas.json",
        "id": 9
      },
      "evidence": "generated/inbound-schemas.json#9;generated/inbound-ids.json#schemaOnlyIds"
    },
    {
      "id": 11,
      "direction": "inbound",
      "name": "SPacketEffectMultiplier",
      "disposition": "implemented",
      "codec": "avsc",
      "schema": {
        "source": "generated/inbound-schemas.json",
        "id": 11
      },
      "evidence": "generated/inbound-schemas.json#11;generated/inbound-ids.json#handlerIds"
    },
    {
      "id": 12,
      "direction": "inbound",
      "name": "SPacketInbound12",
      "disposition": "implemented",
      "codec": "avsc",
      "schema": {
        "source": "generated/inbound-schemas.json",
        "id": 12
      },
      "evidence": "generated/inbound-schemas.json#12;generated/inbound-ids.json#handlerIds"
    },
    {
      "id": 13,
      "direction": "inbound",
      "name": "SPacketUpdateSpeed",
      "disposition": "implemented",
      "codec": "avsc",
      "schema": {
        "source": "generated/inbound-schemas.json",
        "id": 13
      },
      "evidence": "generated/inbound-schemas.json#13;generated/inbound-ids.json#handlerIds"
    },
    {
      "id": 15,
      "direction": "inbound",
      "name": "SPacketLogError",
      "disposition": "implemented",
      "codec": "avsc",
      "schema": {
        "source": "generated/inbound-schemas.json",
        "id": 15
      },
      "evidence": "generated/inbound-schemas.json#15;generated/inbound-ids.json#handlerIds"
    },
    {
      "id": 17,
      "direction": "inbound",
      "name": "SPacketInbound17",
      "disposition": "implemented",
      "codec": "avsc",
      "schema": {
        "source": "generated/inbound-schemas.json",
        "id": 17
      },
      "evidence": "generated/inbound-schemas.json#17;generated/inbound-ids.json#handlerIds"
    },
    {
      "id": 18,
      "direction": "inbound",
      "name": "SPacketPlayerTeleport",
      "disposition": "implemented",
      "codec": "avsc",
      "schema": {
        "source": "generated/inbound-schemas.json",
        "id": 18
      },
      "evidence": "generated/inbound-schemas.json#18;generated/inbound-ids.json#handlerIds"
    },
    {
      "id": 22,
      "direction": "inbound",
      "name": "SPacketInbound22",
      "disposition": "implemented",
      "codec": "avsc",
      "schema": {
        "source": "generated/inbound-schemas.json",
        "id": 22
      },
      "evidence": "generated/inbound-schemas.json#22;generated/inbound-ids.json#handlerIds"
    },
    {
      "id": 24,
      "direction": "inbound",
      "name": "SPacketChunkData",
      "disposition": "implemented",
      "codec": "avsc",
      "schema": {
        "source": "generated/inbound-schemas.json",
        "id": 24
      },
      "evidence": "generated/inbound-schemas.json#24;generated/inbound-ids.json#handlerIds"
    },
    {
      "id": 25,
      "direction": "inbound",
      "name": "SPacketParticles",
      "disposition": "implemented",
      "codec": "avsc",
      "schema": {
        "source": "generated/inbound-schemas.json",
        "id": 25
      },
      "evidence": "generated/inbound-schemas.json#25;generated/inbound-ids.json#handlerIds"
    },
    {
      "id": 29,
      "direction": "inbound",
      "name": "SPacketBulletFire",
      "disposition": "implemented",
      "codec": "avsc",
      "schema": {
        "source": "generated/inbound-schemas.json",
        "id": 29
      },
      "evidence": "generated/inbound-schemas.json#29;generated/inbound-ids.json#handlerIds"
    },
    {
      "id": 30,
      "direction": "inbound",
      "name": "SPacketInbound30",
      "disposition": "implemented",
      "codec": "avsc",
      "schema": {
        "source": "generated/inbound-schemas.json",
        "id": 30
      },
      "evidence": "generated/inbound-schemas.json#30;generated/inbound-ids.json#handlerIds"
    },
    {
      "id": 31,
      "direction": "inbound",
      "name": "SPacketViewAngles",
      "disposition": "implemented",
      "codec": "avsc",
      "schema": {
        "source": "generated/inbound-schemas.json",
        "id": 31
      },
      "evidence": "generated/inbound-schemas.json#31;generated/inbound-ids.json#handlerIds"
    },
    {
      "id": 32,
      "direction": "inbound",
      "name": "SPacketRegisterCustomItem",
      "disposition": "implemented",
      "codec": "avsc",
      "schema": {
        "source": "generated/inbound-schemas.json",
        "id": 32
      },
      "evidence": "generated/inbound-schemas.json#32;generated/inbound-ids.json#handlerIds"
    },
    {
      "id": 33,
      "direction": "inbound",
      "name": "SPacketInbound33",
      "disposition": "implemented",
      "codec": "avsc",
      "schema": {
        "source": "generated/inbound-schemas.json",
        "id": 33
      },
      "evidence": "generated/inbound-schemas.json#33;generated/inbound-ids.json#handlerIds"
    },
    {
      "id": 34,
      "direction": "inbound",
      "name": "SPacketInbound34",
      "disposition": "implemented",
      "codec": "avsc",
      "schema": {
        "source": "generated/inbound-schemas.json",
        "id": 34
      },
      "evidence": "generated/inbound-schemas.json#34;generated/inbound-ids.json#handlerIds"
    },
    {
      "id": 35,
      "direction": "inbound",
      "name": "SPacketInbound35",
      "disposition": "implemented",
      "codec": "avsc",
      "schema": {
        "source": "generated/inbound-schemas.json",
        "id": 35
      },
      "evidence": "generated/inbound-schemas.json#35;generated/inbound-ids.json#handlerIds"
    },
    {
      "id": 36,
      "direction": "inbound",
      "name": "SPacketSetBlock",
      "disposition": "implemented",
      "codec": "avsc",
      "schema": {
        "source": "generated/inbound-schemas.json",
        "id": 36
      },
      "evidence": "generated/inbound-schemas.json#36;generated/inbound-ids.json#handlerIds"
    },
    {
      "id": 37,
      "direction": "inbound",
      "name": "SPacketInbound37",
      "disposition": "implemented",
      "codec": "avsc",
      "schema": {
        "source": "generated/inbound-schemas.json",
        "id": 37
      },
      "evidence": "generated/inbound-schemas.json#37;generated/inbound-ids.json#handlerIds"
    },
    {
      "id": 40,
      "direction": "inbound",
      "name": "SPacketInbound40",
      "disposition": "implemented",
      "codec": "avsc",
      "schema": {
        "source": "generated/inbound-schemas.json",
        "id": 40
      },
      "evidence": "generated/inbound-schemas.json#40;generated/inbound-ids.json#handlerIds"
    },
    {
      "id": 42,
      "direction": "inbound",
      "name": "SPacketInbound42",
      "disposition": "implemented",
      "codec": "avsc",
      "schema": {
        "source": "generated/inbound-schemas.json",
        "id": 42
      },
      "evidence": "generated/inbound-schemas.json#42;generated/inbound-ids.json#handlerIds"
    },
    {
      "id": 45,
      "direction": "inbound",
      "name": "SPacketEntityDamage",
      "disposition": "implemented",
      "codec": "avsc",
      "schema": {
        "source": "generated/inbound-schemas.json",
        "id": 45
      },
      "evidence": "generated/inbound-schemas.json#45;generated/inbound-ids.json#handlerIds"
    },
    {
      "id": 46,
      "direction": "inbound",
      "name": "SPacketInbound46",
      "disposition": "implemented",
      "codec": "avsc",
      "schema": {
        "source": "generated/inbound-schemas.json",
        "id": 46
      },
      "evidence": "generated/inbound-schemas.json#46;generated/inbound-ids.json#handlerIds"
    },
    {
      "id": 50,
      "direction": "inbound",
      "name": "SPacketSetBlock3",
      "disposition": "implemented",
      "codec": "avsc",
      "schema": {
        "source": "generated/inbound-schemas.json",
        "id": 50
      },
      "evidence": "generated/inbound-schemas.json#50;generated/inbound-ids.json#handlerIds"
    },
    {
      "id": 53,
      "direction": "inbound",
      "name": "SPacketBulletHit",
      "disposition": "implemented",
      "codec": "avsc",
      "schema": {
        "source": "generated/inbound-schemas.json",
        "id": 53
      },
      "evidence": "generated/inbound-schemas.json#53;generated/inbound-ids.json#handlerIds"
    },
    {
      "id": 54,
      "direction": "inbound",
      "name": "SPacketInbound54",
      "disposition": "implemented",
      "codec": "avsc",
      "schema": {
        "source": "generated/inbound-schemas.json",
        "id": 54
      },
      "evidence": "generated/inbound-schemas.json#54;generated/inbound-ids.json#handlerIds"
    },
    {
      "id": 56,
      "direction": "inbound",
      "name": "SPacketInbound56",
      "disposition": "implemented",
      "codec": "avsc",
      "schema": {
        "source": "generated/inbound-schemas.json",
        "id": 56
      },
      "evidence": "generated/inbound-schemas.json#56;generated/inbound-ids.json#handlerIds"
    },
    {
      "id": 57,
      "direction": "inbound",
      "name": "SPacketInbound57",
      "disposition": "implemented",
      "codec": "avsc",
      "schema": {
        "source": "generated/inbound-schemas.json",
        "id": 57
      },
      "evidence": "generated/inbound-schemas.json#57;generated/inbound-ids.json#handlerIds"
    },
    {
      "id": 58,
      "direction": "inbound",
      "name": "SPacketInbound58",
      "disposition": "implemented",
      "codec": "avsc",
      "schema": {
        "source": "generated/inbound-schemas.json",
        "id": 58
      },
      "evidence": "generated/inbound-schemas.json#58;generated/inbound-ids.json#handlerIds"
    },
    {
      "id": 59,
      "direction": "inbound",
      "name": "SPacketServerSetting",
      "disposition": "implemented",
      "codec": "avsc",
      "schema": {
        "source": "generated/inbound-schemas.json",
        "id": 59
      },
      "evidence": "generated/inbound-schemas.json#59;generated/inbound-ids.json#handlerIds"
    },
    {
      "id": 60,
      "direction": "inbound",
      "name": "SPacketPlaySound",
      "disposition": "implemented",
      "codec": "avsc",
      "schema": {
        "source": "generated/inbound-schemas.json",
        "id": 60
      },
      "evidence": "generated/inbound-schemas.json#60;generated/inbound-ids.json#handlerIds"
    },
    {
      "id": 63,
      "direction": "inbound",
      "name": "SPacketInbound63",
      "disposition": "implemented",
      "codec": "avsc",
      "schema": {
        "source": "generated/inbound-schemas.json",
        "id": 63
      },
      "evidence": "generated/inbound-schemas.json#63;generated/inbound-ids.json#handlerIds"
    },
    {
      "id": 64,
      "direction": "inbound",
      "name": "SPacketJoinGame",
      "disposition": "implemented",
      "codec": "avsc",
      "schema": {
        "source": "generated/inbound-schemas.json",
        "id": 64
      },
      "evidence": "generated/inbound-schemas.json#64;generated/inbound-ids.json#handlerIds"
    },
    {
      "id": 65,
      "direction": "inbound",
      "name": "SPacketInbound65",
      "disposition": "implemented",
      "codec": "avsc",
      "schema": {
        "source": "generated/inbound-schemas.json",
        "id": 65
      },
      "evidence": "generated/inbound-schemas.json#65;generated/inbound-ids.json#handlerIds"
    },
    {
      "id": 68,
      "direction": "inbound",
      "name": "SPacketInbound68",
      "disposition": "implemented",
      "codec": "avsc",
      "schema": {
        "source": "generated/inbound-schemas.json",
        "id": 68
      },
      "evidence": "generated/inbound-schemas.json#68;generated/inbound-ids.json#handlerIds"
    },
    {
      "id": 72,
      "direction": "inbound",
      "name": "SPacketOpenShop",
      "disposition": "implemented",
      "codec": "avsc",
      "schema": {
        "source": "generated/inbound-schemas.json",
        "id": 72
      },
      "evidence": "generated/inbound-schemas.json#72;generated/inbound-ids.json#handlerIds"
    },
    {
      "id": 74,
      "direction": "inbound",
      "name": "SPacketInbound74",
      "disposition": "implemented",
      "codec": "avsc",
      "schema": {
        "source": "generated/inbound-schemas.json",
        "id": 74
      },
      "evidence": "generated/inbound-schemas.json#74;generated/inbound-ids.json#handlerIds"
    },
    {
      "id": 75,
      "direction": "inbound",
      "name": "SPacketInbound75",
      "disposition": "implemented",
      "codec": "avsc",
      "schema": {
        "source": "generated/inbound-schemas.json",
        "id": 75
      },
      "evidence": "generated/inbound-schemas.json#75;generated/inbound-ids.json#handlerIds"
    },
    {
      "id": 76,
      "direction": "inbound",
      "name": "SPacketInbound76",
      "disposition": "implemented",
      "codec": "avsc",
      "schema": {
        "source": "generated/inbound-schemas.json",
        "id": 76
      },
      "evidence": "generated/inbound-schemas.json#76;generated/inbound-ids.json#handlerIds"
    },
    {
      "id": 77,
      "direction": "inbound",
      "name": "SPacketSetPickupFalse",
      "disposition": "implemented",
      "codec": "avsc",
      "schema": {
        "source": "generated/inbound-schemas.json",
        "id": 77
      },
      "evidence": "generated/inbound-schemas.json#77;generated/inbound-ids.json#handlerIds"
    },
    {
      "id": 81,
      "direction": "inbound",
      "name": "SPacketUpdateChest",
      "disposition": "implemented",
      "codec": "avsc",
      "schema": {
        "source": "generated/inbound-schemas.json",
        "id": 81
      },
      "evidence": "generated/inbound-schemas.json#81;generated/inbound-ids.json#handlerIds"
    },
    {
      "id": 82,
      "direction": "inbound",
      "name": "SPacketInbound82",
      "disposition": "implemented",
      "codec": "avsc",
      "schema": {
        "source": "generated/inbound-schemas.json",
        "id": 82
      },
      "evidence": "generated/inbound-schemas.json#82;generated/inbound-ids.json#handlerIds"
    },
    {
      "id": 83,
      "direction": "inbound",
      "name": "SPacketInbound83",
      "disposition": "implemented",
      "codec": "avsc",
      "schema": {
        "source": "generated/inbound-schemas.json",
        "id": 83
      },
      "evidence": "generated/inbound-schemas.json#83;generated/inbound-ids.json#handlerIds"
    },
    {
      "id": 87,
      "direction": "inbound",
      "name": "SPacketInbound87",
      "disposition": "implemented",
      "codec": "avsc",
      "schema": {
        "source": "generated/inbound-schemas.json",
        "id": 87
      },
      "evidence": "generated/inbound-schemas.json#87;generated/inbound-ids.json#handlerIds"
    },
    {
      "id": 88,
      "direction": "inbound",
      "name": "SPacketUpdateEffect",
      "disposition": "implemented",
      "codec": "avsc",
      "schema": {
        "source": "generated/inbound-schemas.json",
        "id": 88
      },
      "evidence": "generated/inbound-schemas.json#88;generated/inbound-ids.json#handlerIds"
    },
    {
      "id": 89,
      "direction": "inbound",
      "name": "SPacketSetMultiBlock",
      "disposition": "implemented",
      "codec": "avsc",
      "schema": {
        "source": "generated/inbound-schemas.json",
        "id": 89
      },
      "evidence": "generated/inbound-schemas.json#89;generated/inbound-ids.json#handlerIds"
    },
    {
      "id": 90,
      "direction": "inbound",
      "name": "SPacketSetPickupTrue",
      "disposition": "implemented",
      "codec": "avsc",
      "schema": {
        "source": "generated/inbound-schemas.json",
        "id": 90
      },
      "evidence": "generated/inbound-schemas.json#90;generated/inbound-ids.json#handlerIds"
    },
    {
      "id": 91,
      "direction": "inbound",
      "name": "SPacketSyncInventory",
      "disposition": "implemented",
      "codec": "avsc",
      "schema": {
        "source": "generated/inbound-schemas.json",
        "id": 91
      },
      "evidence": "generated/inbound-schemas.json#91;generated/inbound-ids.json#handlerIds"
    },
    {
      "id": 92,
      "direction": "inbound",
      "name": "SPacketEntityVelocityPlayer",
      "disposition": "implemented",
      "codec": "avsc",
      "schema": {
        "source": "generated/inbound-schemas.json",
        "id": 92
      },
      "evidence": "generated/inbound-schemas.json#92;generated/inbound-ids.json#handlerIds"
    },
    {
      "id": 94,
      "direction": "inbound",
      "name": "SPacketInbound94",
      "disposition": "ignored",
      "codec": "avsc",
      "schema": {
        "source": "generated/inbound-schemas.json",
        "id": 94
      },
      "evidence": "generated/inbound-schemas.json#94;generated/inbound-ids.json#schemaOnlyIds"
    },
    {
      "id": 97,
      "direction": "inbound",
      "name": "SPacketSetBlock2",
      "disposition": "implemented",
      "codec": "avsc",
      "schema": {
        "source": "generated/inbound-schemas.json",
        "id": 97
      },
      "evidence": "generated/inbound-schemas.json#97;generated/inbound-ids.json#handlerIds"
    },
    {
      "id": 100,
      "direction": "inbound",
      "name": "SPacketInbound100",
      "disposition": "implemented",
      "codec": "avsc",
      "schema": {
        "source": "generated/inbound-schemas.json",
        "id": 100
      },
      "evidence": "generated/inbound-schemas.json#100;generated/inbound-ids.json#handlerIds"
    },
    {
      "id": 102,
      "direction": "inbound",
      "name": "SPacketInbound102",
      "disposition": "implemented",
      "codec": "avsc",
      "schema": {
        "source": "generated/inbound-schemas.json",
        "id": 102
      },
      "evidence": "generated/inbound-schemas.json#102;generated/inbound-ids.json#handlerIds"
    },
    {
      "id": 103,
      "direction": "inbound",
      "name": "SPacketRemoveEffect",
      "disposition": "implemented",
      "codec": "avsc",
      "schema": {
        "source": "generated/inbound-schemas.json",
        "id": 103
      },
      "evidence": "generated/inbound-schemas.json#103;generated/inbound-ids.json#handlerIds"
    },
    {
      "id": 104,
      "direction": "inbound",
      "name": "SPacketInbound104",
      "disposition": "implemented",
      "codec": "avsc",
      "schema": {
        "source": "generated/inbound-schemas.json",
        "id": 104
      },
      "evidence": "generated/inbound-schemas.json#104;generated/inbound-ids.json#handlerIds"
    },
    {
      "id": 105,
      "direction": "inbound",
      "name": "SPacketSelectSlot",
      "disposition": "implemented",
      "codec": "avsc",
      "schema": {
        "source": "generated/inbound-schemas.json",
        "id": 105
      },
      "evidence": "generated/inbound-schemas.json#105;generated/inbound-ids.json#handlerIds"
    },
    {
      "id": 107,
      "direction": "inbound",
      "name": "SPacketInbound107",
      "disposition": "implemented",
      "codec": "avsc",
      "schema": {
        "source": "generated/inbound-schemas.json",
        "id": 107
      },
      "evidence": "generated/inbound-schemas.json#107;generated/inbound-ids.json#handlerIds"
    },
    {
      "id": 109,
      "direction": "inbound",
      "name": "SPacketEntityVelocity",
      "disposition": "implemented",
      "codec": "avsc",
      "schema": {
        "source": "generated/inbound-schemas.json",
        "id": 109
      },
      "evidence": "generated/inbound-schemas.json#109;generated/inbound-ids.json#handlerIds"
    },
    {
      "id": 111,
      "direction": "inbound",
      "name": "SPacketInbound111",
      "disposition": "implemented",
      "codec": "avsc",
      "schema": {
        "source": "generated/inbound-schemas.json",
        "id": 111
      },
      "evidence": "generated/inbound-schemas.json#111;generated/inbound-ids.json#handlerIds"
    },
    {
      "id": 113,
      "direction": "inbound",
      "name": "SPacketInbound113",
      "disposition": "implemented",
      "codec": "avsc",
      "schema": {
        "source": "generated/inbound-schemas.json",
        "id": 113
      },
      "evidence": "generated/inbound-schemas.json#113;generated/inbound-ids.json#handlerIds"
    },
    {
      "id": 114,
      "direction": "inbound",
      "name": "SPacketInbound114",
      "disposition": "implemented",
      "codec": "avsc",
      "schema": {
        "source": "generated/inbound-schemas.json",
        "id": 114
      },
      "evidence": "generated/inbound-schemas.json#114;generated/inbound-ids.json#handlerIds"
    },
    {
      "id": 115,
      "direction": "inbound",
      "name": "SPacketInbound115",
      "disposition": "implemented",
      "codec": "avsc",
      "schema": {
        "source": "generated/inbound-schemas.json",
        "id": 115
      },
      "evidence": "generated/inbound-schemas.json#115;generated/inbound-ids.json#handlerIds"
    },
    {
      "id": 116,
      "direction": "inbound",
      "name": "SPacketInbound116",
      "disposition": "implemented",
      "codec": "avsc",
      "schema": {
        "source": "generated/inbound-schemas.json",
        "id": 116
      },
      "evidence": "generated/inbound-schemas.json#116;generated/inbound-ids.json#handlerIds"
    },
    {
      "id": 117,
      "direction": "inbound",
      "name": "SPacketInbound117",
      "disposition": "implemented",
      "codec": "avsc",
      "schema": {
        "source": "generated/inbound-schemas.json",
        "id": 117
      },
      "evidence": "generated/inbound-schemas.json#117;generated/inbound-ids.json#handlerIds"
    },
    {
      "id": 118,
      "direction": "inbound",
      "name": "SPacketInbound118",
      "disposition": "implemented",
      "codec": "avsc",
      "schema": {
        "source": "generated/inbound-schemas.json",
        "id": 118
      },
      "evidence": "generated/inbound-schemas.json#118;generated/inbound-ids.json#handlerIds"
    },
    {
      "id": 121,
      "direction": "inbound",
      "name": "SPacketQueueNext",
      "disposition": "ignored",
      "codec": "avsc",
      "schema": {
        "source": "generated/inbound-schemas.json",
        "id": 121
      },
      "evidence": "generated/inbound-schemas.json#121;generated/inbound-ids.json#schemaOnlyIds"
    },
    {
      "id": 122,
      "direction": "inbound",
      "name": "SPacketInbound122",
      "disposition": "implemented",
      "codec": "avsc",
      "schema": {
        "source": "generated/inbound-schemas.json",
        "id": 122
      },
      "evidence": "generated/inbound-schemas.json#122;generated/inbound-ids.json#handlerIds"
    },
    {
      "id": 124,
      "direction": "inbound",
      "name": "SPacketInbound124",
      "disposition": "implemented",
      "codec": "avsc",
      "schema": {
        "source": "generated/inbound-schemas.json",
        "id": 124
      },
      "evidence": "generated/inbound-schemas.json#124;generated/inbound-ids.json#handlerIds"
    },
    {
      "id": 1,
      "direction": "inbound",
      "name": "SPacketHandler1",
      "disposition": "ignored",
      "codec": "json-passthrough",
      "schema": null,
      "evidence": "generated/inbound-ids.json#handlerWithoutSchemaIds"
    },
    {
      "id": 5,
      "direction": "inbound",
      "name": "SPacketPlayerKilled",
      "disposition": "implemented",
      "codec": "json-passthrough",
      "schema": null,
      "evidence": "generated/inbound-ids.json#handlerWithoutSchemaIds"
    },
    {
      "id": 10,
      "direction": "inbound",
      "name": "SPacketHandler10",
      "disposition": "ignored",
      "codec": "json-passthrough",
      "schema": null,
      "evidence": "generated/inbound-ids.json#handlerWithoutSchemaIds"
    },
    {
      "id": 16,
      "direction": "inbound",
      "name": "SPacketHandler16",
      "disposition": "ignored",
      "codec": "json-passthrough",
      "schema": null,
      "evidence": "generated/inbound-ids.json#handlerWithoutSchemaIds"
    },
    {
      "id": 20,
      "direction": "inbound",
      "name": "SPacketHandler20",
      "disposition": "ignored",
      "codec": "json-passthrough",
      "schema": null,
      "evidence": "generated/inbound-ids.json#handlerWithoutSchemaIds"
    },
    {
      "id": 21,
      "direction": "inbound",
      "name": "SPacketHandler21",
      "disposition": "ignored",
      "codec": "json-passthrough",
      "schema": null,
      "evidence": "generated/inbound-ids.json#handlerWithoutSchemaIds"
    },
    {
      "id": 26,
      "direction": "inbound",
      "name": "SPacketSetBlockData",
      "disposition": "implemented",
      "codec": "json-passthrough",
      "schema": null,
      "evidence": "generated/inbound-ids.json#handlerWithoutSchemaIds"
    },
    {
      "id": 28,
      "direction": "inbound",
      "name": "SPacketHandler28",
      "disposition": "ignored",
      "codec": "json-passthrough",
      "schema": null,
      "evidence": "generated/inbound-ids.json#handlerWithoutSchemaIds"
    },
    {
      "id": 39,
      "direction": "inbound",
      "name": "SPacketHandler39",
      "disposition": "ignored",
      "codec": "json-passthrough",
      "schema": null,
      "evidence": "generated/inbound-ids.json#handlerWithoutSchemaIds"
    },
    {
      "id": 41,
      "direction": "inbound",
      "name": "SPacketHandler41",
      "disposition": "ignored",
      "codec": "json-passthrough",
      "schema": null,
      "evidence": "generated/inbound-ids.json#handlerWithoutSchemaIds"
    },
    {
      "id": 44,
      "direction": "inbound",
      "name": "SPacketHandler44",
      "disposition": "ignored",
      "codec": "json-passthrough",
      "schema": null,
      "evidence": "generated/inbound-ids.json#handlerWithoutSchemaIds"
    },
    {
      "id": 47,
      "direction": "inbound",
      "name": "SPacketTopRight",
      "disposition": "implemented",
      "codec": "json-passthrough",
      "schema": null,
      "evidence": "generated/inbound-ids.json#handlerWithoutSchemaIds"
    },
    {
      "id": 49,
      "direction": "inbound",
      "name": "SPacketHandler49",
      "disposition": "ignored",
      "codec": "json-passthrough",
      "schema": null,
      "evidence": "generated/inbound-ids.json#handlerWithoutSchemaIds"
    },
    {
      "id": 51,
      "direction": "inbound",
      "name": "SPacketClearInventory",
      "disposition": "implemented",
      "codec": "json-passthrough",
      "schema": null,
      "evidence": "generated/inbound-ids.json#handlerWithoutSchemaIds"
    },
    {
      "id": 69,
      "direction": "inbound",
      "name": "SPacketHandler69",
      "disposition": "ignored",
      "codec": "json-passthrough",
      "schema": null,
      "evidence": "generated/inbound-ids.json#handlerWithoutSchemaIds"
    },
    {
      "id": 71,
      "direction": "inbound",
      "name": "SPacketHandler71",
      "disposition": "ignored",
      "codec": "json-passthrough",
      "schema": null,
      "evidence": "generated/inbound-ids.json#handlerWithoutSchemaIds"
    },
    {
      "id": 73,
      "direction": "inbound",
      "name": "SPacketHandler73",
      "disposition": "ignored",
      "codec": "json-passthrough",
      "schema": null,
      "evidence": "generated/inbound-ids.json#handlerWithoutSchemaIds"
    },
    {
      "id": 78,
      "direction": "inbound",
      "name": "SPacketPickupItem",
      "disposition": "implemented",
      "codec": "json-passthrough",
      "schema": null,
      "evidence": "generated/inbound-ids.json#handlerWithoutSchemaIds"
    },
    {
      "id": 80,
      "direction": "inbound",
      "name": "SPacketHandler80",
      "disposition": "ignored",
      "codec": "json-passthrough",
      "schema": null,
      "evidence": "generated/inbound-ids.json#handlerWithoutSchemaIds"
    },
    {
      "id": 93,
      "direction": "inbound",
      "name": "SPacketSetSlot",
      "disposition": "implemented",
      "codec": "json-passthrough",
      "schema": null,
      "evidence": "generated/inbound-ids.json#handlerWithoutSchemaIds"
    },
    {
      "id": 96,
      "direction": "inbound",
      "name": "SPacketKillfeed",
      "disposition": "implemented",
      "codec": "json-passthrough",
      "schema": null,
      "evidence": "generated/inbound-ids.json#handlerWithoutSchemaIds"
    },
    {
      "id": 98,
      "direction": "inbound",
      "name": "SPacketHandler98",
      "disposition": "ignored",
      "codec": "json-passthrough",
      "schema": null,
      "evidence": "generated/inbound-ids.json#handlerWithoutSchemaIds"
    },
    {
      "id": 106,
      "direction": "inbound",
      "name": "SPacketEntitySetting",
      "disposition": "implemented",
      "codec": "json-passthrough",
      "schema": null,
      "evidence": "generated/inbound-ids.json#handlerWithoutSchemaIds"
    },
    {
      "id": 112,
      "direction": "inbound",
      "name": "SPacketHandler112",
      "disposition": "ignored",
      "codec": "json-passthrough",
      "schema": null,
      "evidence": "generated/inbound-ids.json#handlerWithoutSchemaIds"
    },
    {
      "id": 119,
      "direction": "inbound",
      "name": "SPacketHandler119",
      "disposition": "ignored",
      "codec": "json-passthrough",
      "schema": null,
      "evidence": "generated/inbound-ids.json#handlerWithoutSchemaIds"
    },
    {
      "id": 120,
      "direction": "inbound",
      "name": "SPacketHandler120",
      "disposition": "ignored",
      "codec": "json-passthrough",
      "schema": null,
      "evidence": "generated/inbound-ids.json#handlerWithoutSchemaIds"
    },
    {
      "id": 125,
      "direction": "inbound",
      "name": "SPacketChat",
      "disposition": "implemented",
      "codec": "json-passthrough",
      "schema": null,
      "evidence": "generated/inbound-ids.json#handlerWithoutSchemaIds"
    },
    {
      "id": 126,
      "direction": "inbound",
      "name": "SPacketHandler126",
      "disposition": "ignored",
      "codec": "json-passthrough",
      "schema": null,
      "evidence": "generated/inbound-ids.json#handlerWithoutSchemaIds"
    },
    {
      "id": 127,
      "direction": "inbound",
      "name": "SPacketHandler127",
      "disposition": "ignored",
      "codec": "json-passthrough",
      "schema": null,
      "evidence": "generated/inbound-ids.json#handlerWithoutSchemaIds"
    },
    {
      "id": null,
      "direction": "inbound",
      "name": "SPacketEquipArmor",
      "disposition": "ignored",
      "codec": "none",
      "schema": null,
      "evidence": "legacy-handler-alias:no 853 wire id in generated/inbound-ids.json"
    },
    {
      "id": null,
      "direction": "inbound",
      "name": "SPacketResyncVelocity",
      "disposition": "ignored",
      "codec": "none",
      "schema": null,
      "evidence": "legacy-handler-alias:no 853 wire id in generated/inbound-ids.json"
    }
  ],
  "outbound": [
    {
      "id": 1,
      "direction": "outbound",
      "name": "CPacketUseBoat",
      "disposition": "implemented",
      "codec": "avsc",
      "schema": {
        "source": "generated/outbound-schemas.json",
        "id": 1
      },
      "evidence": "generated/outbound-schemas.json#1;generated/outbound-call-sites.json#1"
    },
    {
      "id": 2,
      "direction": "outbound",
      "name": "CPacketOutbound2",
      "disposition": "implemented",
      "codec": "avsc",
      "schema": {
        "source": "generated/outbound-schemas.json",
        "id": 2
      },
      "evidence": "generated/outbound-schemas.json#2;generated/outbound-call-sites.json#2"
    },
    {
      "id": 4,
      "direction": "outbound",
      "name": "CPacketOutbound4",
      "disposition": "implemented",
      "codec": "avsc",
      "schema": {
        "source": "generated/outbound-schemas.json",
        "id": 4
      },
      "evidence": "generated/outbound-schemas.json#4;generated/outbound-call-sites.json#4"
    },
    {
      "id": 5,
      "direction": "outbound",
      "name": "CPacketMoveItemAmount",
      "disposition": "implemented",
      "codec": "avsc",
      "schema": {
        "source": "generated/outbound-schemas.json",
        "id": 5
      },
      "evidence": "generated/outbound-schemas.json#5;generated/outbound-call-sites.json#5"
    },
    {
      "id": 6,
      "direction": "outbound",
      "name": "CPacketSwingItem",
      "disposition": "implemented",
      "codec": "avsc",
      "schema": {
        "source": "generated/outbound-schemas.json",
        "id": 6
      },
      "evidence": "generated/outbound-schemas.json#6;generated/outbound-call-sites.json#6"
    },
    {
      "id": 8,
      "direction": "outbound",
      "name": "CPacketTickEventDetection",
      "disposition": "implemented",
      "codec": "avsc",
      "schema": {
        "source": "generated/outbound-schemas.json",
        "id": 8
      },
      "evidence": "generated/outbound-schemas.json#8;generated/outbound-call-sites.json#8"
    },
    {
      "id": 9,
      "direction": "outbound",
      "name": "CPacketMoveItemQuick",
      "disposition": "implemented",
      "codec": "avsc",
      "schema": {
        "source": "generated/outbound-schemas.json",
        "id": 9
      },
      "evidence": "generated/outbound-schemas.json#9;generated/outbound-call-sites.json#9"
    },
    {
      "id": 10,
      "direction": "outbound",
      "name": "CPacketMoveItem",
      "disposition": "implemented",
      "codec": "avsc",
      "schema": {
        "source": "generated/outbound-schemas.json",
        "id": 10
      },
      "evidence": "generated/outbound-schemas.json#10;generated/outbound-call-sites.json#10"
    },
    {
      "id": 13,
      "direction": "outbound",
      "name": "CPacketOutbound13",
      "disposition": "ignored",
      "codec": "avsc",
      "schema": {
        "source": "generated/outbound-schemas.json",
        "id": 13
      },
      "evidence": "generated/outbound-schemas.json#13;generated/outbound-ids.json#schemaOnlyIds"
    },
    {
      "id": 14,
      "direction": "outbound",
      "name": "CPacketOutbound14",
      "disposition": "implemented",
      "codec": "avsc",
      "schema": {
        "source": "generated/outbound-schemas.json",
        "id": 14
      },
      "evidence": "generated/outbound-schemas.json#14;generated/outbound-call-sites.json#14"
    },
    {
      "id": 16,
      "direction": "outbound",
      "name": "CPacketOutbound16",
      "disposition": "implemented",
      "codec": "avsc",
      "schema": {
        "source": "generated/outbound-schemas.json",
        "id": 16
      },
      "evidence": "generated/outbound-schemas.json#16;generated/outbound-call-sites.json#16"
    },
    {
      "id": 17,
      "direction": "outbound",
      "name": "CPacketOutbound17",
      "disposition": "implemented",
      "codec": "avsc",
      "schema": {
        "source": "generated/outbound-schemas.json",
        "id": 17
      },
      "evidence": "generated/outbound-schemas.json#17;generated/outbound-call-sites.json#17"
    },
    {
      "id": 20,
      "direction": "outbound",
      "name": "CPacketKillDetection",
      "disposition": "implemented",
      "codec": "avsc",
      "schema": {
        "source": "generated/outbound-schemas.json",
        "id": 20
      },
      "evidence": "generated/outbound-schemas.json#20;generated/outbound-call-sites.json#20"
    },
    {
      "id": 21,
      "direction": "outbound",
      "name": "CPacketOutbound21",
      "disposition": "ignored",
      "codec": "avsc",
      "schema": {
        "source": "generated/outbound-schemas.json",
        "id": 21
      },
      "evidence": "generated/outbound-schemas.json#21;generated/outbound-ids.json#schemaOnlyIds"
    },
    {
      "id": 24,
      "direction": "outbound",
      "name": "CPacketOutbound24",
      "disposition": "implemented",
      "codec": "avsc",
      "schema": {
        "source": "generated/outbound-schemas.json",
        "id": 24
      },
      "evidence": "generated/outbound-schemas.json#24;generated/outbound-call-sites.json#24"
    },
    {
      "id": 25,
      "direction": "outbound",
      "name": "CPacketKeepAliveDetection",
      "disposition": "implemented",
      "codec": "avsc",
      "schema": {
        "source": "generated/outbound-schemas.json",
        "id": 25
      },
      "evidence": "generated/outbound-schemas.json#25;generated/outbound-call-sites.json#25"
    },
    {
      "id": 26,
      "direction": "outbound",
      "name": "CPacketOutbound26",
      "disposition": "implemented",
      "codec": "avsc",
      "schema": {
        "source": "generated/outbound-schemas.json",
        "id": 26
      },
      "evidence": "generated/outbound-schemas.json#26;generated/outbound-call-sites.json#26"
    },
    {
      "id": 29,
      "direction": "outbound",
      "name": "CPacketAcceptTeleport",
      "disposition": "implemented",
      "codec": "avsc",
      "schema": {
        "source": "generated/outbound-schemas.json",
        "id": 29
      },
      "evidence": "generated/outbound-schemas.json#29;generated/outbound-call-sites.json#29"
    },
    {
      "id": 33,
      "direction": "outbound",
      "name": "CPacketOutbound33",
      "disposition": "implemented",
      "codec": "avsc",
      "schema": {
        "source": "generated/outbound-schemas.json",
        "id": 33
      },
      "evidence": "generated/outbound-schemas.json#33;generated/outbound-call-sites.json#33"
    },
    {
      "id": 34,
      "direction": "outbound",
      "name": "CPacketOutbound34",
      "disposition": "implemented",
      "codec": "avsc",
      "schema": {
        "source": "generated/outbound-schemas.json",
        "id": 34
      },
      "evidence": "generated/outbound-schemas.json#34;generated/outbound-call-sites.json#34"
    },
    {
      "id": 35,
      "direction": "outbound",
      "name": "CPacketOutbound35",
      "disposition": "implemented",
      "codec": "avsc",
      "schema": {
        "source": "generated/outbound-schemas.json",
        "id": 35
      },
      "evidence": "generated/outbound-schemas.json#35;generated/outbound-call-sites.json#35"
    },
    {
      "id": 37,
      "direction": "outbound",
      "name": "CPacketOutbound37",
      "disposition": "implemented",
      "codec": "avsc",
      "schema": {
        "source": "generated/outbound-schemas.json",
        "id": 37
      },
      "evidence": "generated/outbound-schemas.json#37;generated/outbound-call-sites.json#37"
    },
    {
      "id": 38,
      "direction": "outbound",
      "name": "CPacketChat",
      "disposition": "implemented",
      "codec": "avsc",
      "schema": {
        "source": "generated/outbound-schemas.json",
        "id": 38
      },
      "evidence": "generated/outbound-schemas.json#38;generated/outbound-call-sites.json#38"
    },
    {
      "id": 39,
      "direction": "outbound",
      "name": "CPacketOutbound39",
      "disposition": "implemented",
      "codec": "avsc",
      "schema": {
        "source": "generated/outbound-schemas.json",
        "id": 39
      },
      "evidence": "generated/outbound-schemas.json#39;generated/outbound-call-sites.json#39"
    },
    {
      "id": 40,
      "direction": "outbound",
      "name": "CPacketOutbound40",
      "disposition": "implemented",
      "codec": "avsc",
      "schema": {
        "source": "generated/outbound-schemas.json",
        "id": 40
      },
      "evidence": "generated/outbound-schemas.json#40;generated/outbound-call-sites.json#40"
    },
    {
      "id": 41,
      "direction": "outbound",
      "name": "CPacketOutbound41",
      "disposition": "ignored",
      "codec": "avsc",
      "schema": {
        "source": "generated/outbound-schemas.json",
        "id": 41
      },
      "evidence": "generated/outbound-schemas.json#41;generated/outbound-ids.json#schemaOnlyIds"
    },
    {
      "id": 43,
      "direction": "outbound",
      "name": "CPacketModifyBlock",
      "disposition": "implemented",
      "codec": "avsc",
      "schema": {
        "source": "generated/outbound-schemas.json",
        "id": 43
      },
      "evidence": "generated/outbound-schemas.json#43;generated/outbound-call-sites.json#43"
    },
    {
      "id": 46,
      "direction": "outbound",
      "name": "CPacketUpdateSkin",
      "disposition": "implemented",
      "codec": "avsc",
      "schema": {
        "source": "generated/outbound-schemas.json",
        "id": 46
      },
      "evidence": "generated/outbound-schemas.json#46;generated/outbound-call-sites.json#46"
    },
    {
      "id": 49,
      "direction": "outbound",
      "name": "CPacketFillBucket",
      "disposition": "implemented",
      "codec": "avsc",
      "schema": {
        "source": "generated/outbound-schemas.json",
        "id": 49
      },
      "evidence": "generated/outbound-schemas.json#49;generated/outbound-call-sites.json#49"
    },
    {
      "id": 52,
      "direction": "outbound",
      "name": "CPacketReportPlayer",
      "disposition": "implemented",
      "codec": "avsc",
      "schema": {
        "source": "generated/outbound-schemas.json",
        "id": 52
      },
      "evidence": "generated/outbound-schemas.json#52;generated/outbound-call-sites.json#52"
    },
    {
      "id": 54,
      "direction": "outbound",
      "name": "CPacketOutbound54",
      "disposition": "implemented",
      "codec": "avsc",
      "schema": {
        "source": "generated/outbound-schemas.json",
        "id": 54
      },
      "evidence": "generated/outbound-schemas.json#54;generated/outbound-call-sites.json#54"
    },
    {
      "id": 56,
      "direction": "outbound",
      "name": "CPacketOutbound56",
      "disposition": "ignored",
      "codec": "avsc",
      "schema": {
        "source": "generated/outbound-schemas.json",
        "id": 56
      },
      "evidence": "generated/outbound-schemas.json#56;generated/outbound-ids.json#schemaOnlyIds"
    },
    {
      "id": 59,
      "direction": "outbound",
      "name": "CPacketOutbound59",
      "disposition": "implemented",
      "codec": "avsc",
      "schema": {
        "source": "generated/outbound-schemas.json",
        "id": 59
      },
      "evidence": "generated/outbound-schemas.json#59;generated/outbound-call-sites.json#59"
    },
    {
      "id": 60,
      "direction": "outbound",
      "name": "CPacketJoinDiscord",
      "disposition": "implemented",
      "codec": "avsc",
      "schema": {
        "source": "generated/outbound-schemas.json",
        "id": 60
      },
      "evidence": "generated/outbound-schemas.json#60;generated/outbound-call-sites.json#60"
    },
    {
      "id": 61,
      "direction": "outbound",
      "name": "CPacketOutbound61",
      "disposition": "ignored",
      "codec": "avsc",
      "schema": {
        "source": "generated/outbound-schemas.json",
        "id": 61
      },
      "evidence": "generated/outbound-schemas.json#61;generated/outbound-ids.json#schemaOnlyIds"
    },
    {
      "id": 62,
      "direction": "outbound",
      "name": "CPacketOutbound62",
      "disposition": "implemented",
      "codec": "avsc",
      "schema": {
        "source": "generated/outbound-schemas.json",
        "id": 62
      },
      "evidence": "generated/outbound-schemas.json#62;generated/outbound-call-sites.json#62"
    },
    {
      "id": 64,
      "direction": "outbound",
      "name": "CPacketOutbound64",
      "disposition": "implemented",
      "codec": "avsc",
      "schema": {
        "source": "generated/outbound-schemas.json",
        "id": 64
      },
      "evidence": "generated/outbound-schemas.json#64;generated/outbound-call-sites.json#64"
    },
    {
      "id": 65,
      "direction": "outbound",
      "name": "CPacketRemoveItem2",
      "disposition": "implemented",
      "codec": "avsc",
      "schema": {
        "source": "generated/outbound-schemas.json",
        "id": 65
      },
      "evidence": "generated/outbound-schemas.json#65;generated/outbound-call-sites.json#65"
    },
    {
      "id": 67,
      "direction": "outbound",
      "name": "CPacketOutbound67",
      "disposition": "implemented",
      "codec": "avsc",
      "schema": {
        "source": "generated/outbound-schemas.json",
        "id": 67
      },
      "evidence": "generated/outbound-schemas.json#67;generated/outbound-call-sites.json#67"
    },
    {
      "id": 69,
      "direction": "outbound",
      "name": "CPacketHookDetection",
      "disposition": "implemented",
      "codec": "avsc",
      "schema": {
        "source": "generated/outbound-schemas.json",
        "id": 69
      },
      "evidence": "generated/outbound-schemas.json#69;generated/outbound-call-sites.json#69"
    },
    {
      "id": 70,
      "direction": "outbound",
      "name": "CPacketOutbound70",
      "disposition": "ignored",
      "codec": "avsc",
      "schema": {
        "source": "generated/outbound-schemas.json",
        "id": 70
      },
      "evidence": "generated/outbound-schemas.json#70;generated/outbound-ids.json#schemaOnlyIds"
    },
    {
      "id": 73,
      "direction": "outbound",
      "name": "CPacketOutbound73",
      "disposition": "implemented",
      "codec": "avsc",
      "schema": {
        "source": "generated/outbound-schemas.json",
        "id": 73
      },
      "evidence": "generated/outbound-schemas.json#73;generated/outbound-call-sites.json#73"
    },
    {
      "id": 76,
      "direction": "outbound",
      "name": "CPacketSalvageItem",
      "disposition": "implemented",
      "codec": "avsc",
      "schema": {
        "source": "generated/outbound-schemas.json",
        "id": 76
      },
      "evidence": "generated/outbound-schemas.json#76;generated/outbound-call-sites.json#76"
    },
    {
      "id": 78,
      "direction": "outbound",
      "name": "CPacketUseBucket",
      "disposition": "implemented",
      "codec": "avsc",
      "schema": {
        "source": "generated/outbound-schemas.json",
        "id": 78
      },
      "evidence": "generated/outbound-schemas.json#78;generated/outbound-call-sites.json#78"
    },
    {
      "id": 79,
      "direction": "outbound",
      "name": "CPacketUpdateSignLines",
      "disposition": "implemented",
      "codec": "avsc",
      "schema": {
        "source": "generated/outbound-schemas.json",
        "id": 79
      },
      "evidence": "generated/outbound-schemas.json#79;generated/outbound-call-sites.json#79"
    },
    {
      "id": 80,
      "direction": "outbound",
      "name": "CPacketRest",
      "disposition": "implemented",
      "codec": "avsc",
      "schema": {
        "source": "generated/outbound-schemas.json",
        "id": 80
      },
      "evidence": "generated/outbound-schemas.json#80;generated/outbound-call-sites.json#80"
    },
    {
      "id": 84,
      "direction": "outbound",
      "name": "CPacketOutbound84",
      "disposition": "ignored",
      "codec": "avsc",
      "schema": {
        "source": "generated/outbound-schemas.json",
        "id": 84
      },
      "evidence": "generated/outbound-schemas.json#84;generated/outbound-ids.json#schemaOnlyIds"
    },
    {
      "id": 87,
      "direction": "outbound",
      "name": "CPacketSimulationDetection",
      "disposition": "implemented",
      "codec": "avsc",
      "schema": {
        "source": "generated/outbound-schemas.json",
        "id": 87
      },
      "evidence": "generated/outbound-schemas.json#87;generated/outbound-call-sites.json#87"
    },
    {
      "id": 88,
      "direction": "outbound",
      "name": "CPacketEnchantItem",
      "disposition": "implemented",
      "codec": "avsc",
      "schema": {
        "source": "generated/outbound-schemas.json",
        "id": 88
      },
      "evidence": "generated/outbound-schemas.json#88;generated/outbound-call-sites.json#88"
    },
    {
      "id": 90,
      "direction": "outbound",
      "name": "CPacketOutbound90",
      "disposition": "implemented",
      "codec": "avsc",
      "schema": {
        "source": "generated/outbound-schemas.json",
        "id": 90
      },
      "evidence": "generated/outbound-schemas.json#90;generated/outbound-call-sites.json#90"
    },
    {
      "id": 91,
      "direction": "outbound",
      "name": "CPacketFinishUse",
      "disposition": "implemented",
      "codec": "avsc",
      "schema": {
        "source": "generated/outbound-schemas.json",
        "id": 91
      },
      "evidence": "generated/outbound-schemas.json#91;generated/outbound-call-sites.json#91"
    },
    {
      "id": 92,
      "direction": "outbound",
      "name": "CPacketOutbound92",
      "disposition": "ignored",
      "codec": "avsc",
      "schema": {
        "source": "generated/outbound-schemas.json",
        "id": 92
      },
      "evidence": "generated/outbound-schemas.json#92;generated/outbound-ids.json#schemaOnlyIds"
    },
    {
      "id": 93,
      "direction": "outbound",
      "name": "CPacketSelectSlot",
      "disposition": "implemented",
      "codec": "avsc",
      "schema": {
        "source": "generated/outbound-schemas.json",
        "id": 93
      },
      "evidence": "generated/outbound-schemas.json#93;generated/outbound-call-sites.json#93"
    },
    {
      "id": 94,
      "direction": "outbound",
      "name": "CPacketFireBullet",
      "disposition": "implemented",
      "codec": "avsc",
      "schema": {
        "source": "generated/outbound-schemas.json",
        "id": 94
      },
      "evidence": "generated/outbound-schemas.json#94;generated/outbound-call-sites.json#94"
    },
    {
      "id": 95,
      "direction": "outbound",
      "name": "CPacketOutbound95",
      "disposition": "implemented",
      "codec": "avsc",
      "schema": {
        "source": "generated/outbound-schemas.json",
        "id": 95
      },
      "evidence": "generated/outbound-schemas.json#95;generated/outbound-call-sites.json#95"
    },
    {
      "id": 96,
      "direction": "outbound",
      "name": "CPacketWriteBook",
      "disposition": "implemented",
      "codec": "avsc",
      "schema": {
        "source": "generated/outbound-schemas.json",
        "id": 96
      },
      "evidence": "generated/outbound-schemas.json#96;generated/outbound-call-sites.json#96"
    },
    {
      "id": 97,
      "direction": "outbound",
      "name": "CPacketBreakEntity",
      "disposition": "implemented",
      "codec": "avsc",
      "schema": {
        "source": "generated/outbound-schemas.json",
        "id": 97
      },
      "evidence": "generated/outbound-schemas.json#97;generated/outbound-call-sites.json#97"
    },
    {
      "id": 98,
      "direction": "outbound",
      "name": "CPacketOutbound98",
      "disposition": "ignored",
      "codec": "avsc",
      "schema": {
        "source": "generated/outbound-schemas.json",
        "id": 98
      },
      "evidence": "generated/outbound-schemas.json#98;generated/outbound-ids.json#schemaOnlyIds"
    },
    {
      "id": 99,
      "direction": "outbound",
      "name": "CPacketOutbound99",
      "disposition": "implemented",
      "codec": "avsc",
      "schema": {
        "source": "generated/outbound-schemas.json",
        "id": 99
      },
      "evidence": "generated/outbound-schemas.json#99;generated/outbound-call-sites.json#99"
    },
    {
      "id": 102,
      "direction": "outbound",
      "name": "CPacketOutbound102",
      "disposition": "implemented",
      "codec": "avsc",
      "schema": {
        "source": "generated/outbound-schemas.json",
        "id": 102
      },
      "evidence": "generated/outbound-schemas.json#102;generated/outbound-call-sites.json#102"
    },
    {
      "id": 103,
      "direction": "outbound",
      "name": "CPacketRequestChunk",
      "disposition": "implemented",
      "codec": "avsc",
      "schema": {
        "source": "generated/outbound-schemas.json",
        "id": 103
      },
      "evidence": "generated/outbound-schemas.json#103;generated/outbound-call-sites.json#103"
    },
    {
      "id": 104,
      "direction": "outbound",
      "name": "CPacketAnalytics",
      "disposition": "implemented",
      "codec": "avsc",
      "schema": {
        "source": "generated/outbound-schemas.json",
        "id": 104
      },
      "evidence": "generated/outbound-schemas.json#104;generated/outbound-call-sites.json#104"
    },
    {
      "id": 105,
      "direction": "outbound",
      "name": "CPacketBaseEventDetection",
      "disposition": "implemented",
      "codec": "avsc",
      "schema": {
        "source": "generated/outbound-schemas.json",
        "id": 105
      },
      "evidence": "generated/outbound-schemas.json#105;generated/outbound-call-sites.json#105"
    },
    {
      "id": 107,
      "direction": "outbound",
      "name": "CPacketAttackEntity",
      "disposition": "implemented",
      "codec": "avsc",
      "schema": {
        "source": "generated/outbound-schemas.json",
        "id": 107
      },
      "evidence": "generated/outbound-schemas.json#107;generated/outbound-call-sites.json#107"
    },
    {
      "id": 109,
      "direction": "outbound",
      "name": "CPacketPickupItem",
      "disposition": "implemented",
      "codec": "avsc",
      "schema": {
        "source": "generated/outbound-schemas.json",
        "id": 109
      },
      "evidence": "generated/outbound-schemas.json#109;generated/outbound-call-sites.json#109"
    },
    {
      "id": 111,
      "direction": "outbound",
      "name": "CPacketMovePlayer",
      "disposition": "implemented",
      "codec": "avsc",
      "schema": {
        "source": "generated/outbound-schemas.json",
        "id": 111
      },
      "evidence": "generated/outbound-schemas.json#111;generated/outbound-call-sites.json#111"
    },
    {
      "id": 114,
      "direction": "outbound",
      "name": "CPacketOutbound114",
      "disposition": "ignored",
      "codec": "avsc",
      "schema": {
        "source": "generated/outbound-schemas.json",
        "id": 114
      },
      "evidence": "generated/outbound-schemas.json#114;generated/outbound-ids.json#schemaOnlyIds"
    },
    {
      "id": 115,
      "direction": "outbound",
      "name": "CPacketRemoveItem",
      "disposition": "implemented",
      "codec": "avsc",
      "schema": {
        "source": "generated/outbound-schemas.json",
        "id": 115
      },
      "evidence": "generated/outbound-schemas.json#115;generated/outbound-call-sites.json#115"
    },
    {
      "id": 117,
      "direction": "outbound",
      "name": "CPacketCraftItem",
      "disposition": "implemented",
      "codec": "avsc",
      "schema": {
        "source": "generated/outbound-schemas.json",
        "id": 117
      },
      "evidence": "generated/outbound-schemas.json#117;generated/outbound-call-sites.json#117"
    },
    {
      "id": 118,
      "direction": "outbound",
      "name": "CPacketOutbound118",
      "disposition": "ignored",
      "codec": "avsc",
      "schema": {
        "source": "generated/outbound-schemas.json",
        "id": 118
      },
      "evidence": "generated/outbound-schemas.json#118;generated/outbound-ids.json#schemaOnlyIds"
    },
    {
      "id": 119,
      "direction": "outbound",
      "name": "CPacketIgnorePlayer",
      "disposition": "implemented",
      "codec": "avsc",
      "schema": {
        "source": "generated/outbound-schemas.json",
        "id": 119
      },
      "evidence": "generated/outbound-schemas.json#119;generated/outbound-call-sites.json#119"
    },
    {
      "id": 120,
      "direction": "outbound",
      "name": "CPacketOutbound120",
      "disposition": "ignored",
      "codec": "avsc",
      "schema": {
        "source": "generated/outbound-schemas.json",
        "id": 120
      },
      "evidence": "generated/outbound-schemas.json#120;generated/outbound-ids.json#schemaOnlyIds"
    },
    {
      "id": 121,
      "direction": "outbound",
      "name": "CPacketBreakBlock",
      "disposition": "implemented",
      "codec": "avsc",
      "schema": {
        "source": "generated/outbound-schemas.json",
        "id": 121
      },
      "evidence": "generated/outbound-schemas.json#121;generated/outbound-call-sites.json#121"
    },
    {
      "id": 123,
      "direction": "outbound",
      "name": "CPacketMilkEntity",
      "disposition": "implemented",
      "codec": "avsc",
      "schema": {
        "source": "generated/outbound-schemas.json",
        "id": 123
      },
      "evidence": "generated/outbound-schemas.json#123;generated/outbound-call-sites.json#123"
    },
    {
      "id": 124,
      "direction": "outbound",
      "name": "CPacketOutbound124",
      "disposition": "ignored",
      "codec": "avsc",
      "schema": {
        "source": "generated/outbound-schemas.json",
        "id": 124
      },
      "evidence": "generated/outbound-schemas.json#124;generated/outbound-ids.json#schemaOnlyIds"
    },
    {
      "id": 7,
      "direction": "outbound",
      "name": "CPacketCallSite7",
      "disposition": "implemented",
      "codec": "json-passthrough",
      "schema": null,
      "evidence": "generated/outbound-ids.json#callSiteWithoutSchemaIds"
    },
    {
      "id": 45,
      "direction": "outbound",
      "name": "CPacketShopPurchase",
      "disposition": "implemented",
      "codec": "json-passthrough",
      "schema": null,
      "evidence": "generated/outbound-ids.json#callSiteWithoutSchemaIds"
    },
    {
      "id": 55,
      "direction": "outbound",
      "name": "CPacketCallSite55",
      "disposition": "implemented",
      "codec": "json-passthrough",
      "schema": null,
      "evidence": "generated/outbound-ids.json#callSiteWithoutSchemaIds"
    },
    {
      "id": 71,
      "direction": "outbound",
      "name": "CPacketCallSite71",
      "disposition": "implemented",
      "codec": "json-passthrough",
      "schema": null,
      "evidence": "generated/outbound-ids.json#callSiteWithoutSchemaIds"
    },
    {
      "id": 112,
      "direction": "outbound",
      "name": "CPacketCallSite112",
      "disposition": "implemented",
      "codec": "json-passthrough",
      "schema": null,
      "evidence": "generated/outbound-ids.json#callSiteWithoutSchemaIds"
    },
    {
      "id": 116,
      "direction": "outbound",
      "name": "CPacketCloseChest",
      "disposition": "implemented",
      "codec": "json-passthrough",
      "schema": null,
      "evidence": "generated/outbound-ids.json#callSiteWithoutSchemaIds"
    },
    {
      "id": 111,
      "direction": "outbound",
      "name": "CPacketReloadGun",
      "disposition": "implemented",
      "codec": "avsc",
      "schema": {
        "source": "generated/outbound-schemas.json",
        "id": 111
      },
      "evidence": "alias-of:CPacketMovePlayer;generated/outbound-schemas.json#111;generated/outbound-call-sites.json#111"
    },
    {
      "id": 105,
      "direction": "outbound",
      "name": "CPacketResponseDetection",
      "disposition": "implemented",
      "codec": "avsc",
      "schema": {
        "source": "generated/outbound-schemas.json",
        "id": 105
      },
      "evidence": "alias-of:CPacketBaseEventDetection;generated/outbound-schemas.json#105;generated/outbound-call-sites.json#105"
    },
    {
      "id": null,
      "direction": "outbound",
      "name": "CPacketGravityDetection",
      "disposition": "unsupported",
      "codec": "none",
      "schema": null,
      "evidence": "explicit-unsupported:mapping.json#unmapped.outbound"
    },
    {
      "id": null,
      "direction": "outbound",
      "name": "CPacketConstantDetection",
      "disposition": "unsupported",
      "codec": "none",
      "schema": null,
      "evidence": "explicit-unsupported:mapping.json#unmapped.outbound"
    },
    {
      "id": null,
      "direction": "outbound",
      "name": "CPacketConstantDetection2",
      "disposition": "unsupported",
      "codec": "none",
      "schema": null,
      "evidence": "explicit-unsupported:mapping.json#unmapped.outbound"
    },
    {
      "id": null,
      "direction": "outbound",
      "name": "CPacketConstantDetection3",
      "disposition": "unsupported",
      "codec": "none",
      "schema": null,
      "evidence": "explicit-unsupported:mapping.json#unmapped.outbound"
    },
    {
      "id": null,
      "direction": "outbound",
      "name": "CPacketConstantDetection4",
      "disposition": "unsupported",
      "codec": "none",
      "schema": null,
      "evidence": "explicit-unsupported:mapping.json#unmapped.outbound"
    },
    {
      "id": null,
      "direction": "outbound",
      "name": "CPacketConstantDetection5",
      "disposition": "unsupported",
      "codec": "none",
      "schema": null,
      "evidence": "explicit-unsupported:mapping.json#unmapped.outbound"
    },
    {
      "id": null,
      "direction": "outbound",
      "name": "CPacketConstantDetection6",
      "disposition": "unsupported",
      "codec": "none",
      "schema": null,
      "evidence": "explicit-unsupported:mapping.json#unmapped.outbound"
    },
    {
      "id": null,
      "direction": "outbound",
      "name": "CPacketConstantDetection7",
      "disposition": "unsupported",
      "codec": "none",
      "schema": null,
      "evidence": "explicit-unsupported:mapping.json#unmapped.outbound"
    },
    {
      "id": null,
      "direction": "outbound",
      "name": "CPacketConstantDetection8",
      "disposition": "unsupported",
      "codec": "none",
      "schema": null,
      "evidence": "explicit-unsupported:mapping.json#unmapped.outbound"
    },
    {
      "id": null,
      "direction": "outbound",
      "name": "CPacketConstantDetection9",
      "disposition": "unsupported",
      "codec": "none",
      "schema": null,
      "evidence": "explicit-unsupported:mapping.json#unmapped.outbound"
    },
    {
      "id": null,
      "direction": "outbound",
      "name": "CPacketConstantDetection10",
      "disposition": "unsupported",
      "codec": "none",
      "schema": null,
      "evidence": "explicit-unsupported:mapping.json#unmapped.outbound"
    },
    {
      "id": null,
      "direction": "outbound",
      "name": "CPacketConstantDetection11",
      "disposition": "unsupported",
      "codec": "none",
      "schema": null,
      "evidence": "explicit-unsupported:mapping.json#unmapped.outbound"
    },
    {
      "id": null,
      "direction": "outbound",
      "name": "CPacketUseItem",
      "disposition": "unsupported",
      "codec": "none",
      "schema": null,
      "evidence": "explicit-unsupported:mapping.json#unmapped.outbound"
    },
    {
      "id": null,
      "direction": "outbound",
      "name": "CPacketSpecialActionUp",
      "disposition": "unsupported",
      "codec": "none",
      "schema": null,
      "evidence": "explicit-unsupported:mapping.json#unmapped.outbound"
    },
    {
      "id": null,
      "direction": "outbound",
      "name": "CPacketRespawn",
      "disposition": "unsupported",
      "codec": "none",
      "schema": null,
      "evidence": "explicit-unsupported:mapping.json#unmapped.outbound"
    },
    {
      "id": null,
      "direction": "outbound",
      "name": "CPacketStartUse",
      "disposition": "unsupported",
      "codec": "none",
      "schema": null,
      "evidence": "explicit-unsupported:mapping.json#unmapped.outbound"
    }
  ]
};

// ---------------------------------------------------------------------------
// Evidence-backed settings packet
// ---------------------------------------------------------------------------

/*
 * Inbound 59 is the per-player settings bulk update. The frozen 854 schema
 * (tFF/IFF, entries qFF/pFF/DFF/fFF) and the generated
 * apply module prove the settings semantics. The schema below keeps the historical field names
 * (UT/KT/wT/vT/eT/uT) because the mapped pair is structurally identical; the
 * 854 wire names are recorded in wireFields.
 */
const SETTINGS_EVIDENCE_ID = 59;
const SETTINGS_LEDGER_ROW = PROTOCOL_LEDGER.inbound.find((row) => (
  row.direction === 'inbound' && row.id === SETTINGS_EVIDENCE_ID
)) || null;
const PROTOCOL_SETTINGS = SETTINGS_LEDGER_ROW && INBOUND_SCHEMAS[SETTINGS_LEDGER_ROW.name]
  ? Object.freeze({
    id: SETTINGS_LEDGER_ROW.id,
    name: SETTINGS_LEDGER_ROW.name,
    fields: Object.freeze({
      entries: 'UT',
      removed: 'KT',
      playerId: 'wT',
      name: 'vT',
      settingsJson: 'eT',
      removedKeys: 'uT'
    }),
    wireFields: Object.freeze({
      entries: 'tFF',
      removed: 'IFF',
      playerId: 'qFF',
      name: 'pFF',
      settingsJson: 'DFF',
      removedKeys: 'fFF'
    }),
    evidence: 'generated/inbound-schemas.json#59;generated/inbound-semantics.json#59;generated 854 settings apply module'
  })
  : null;

/*
 * SPacketJoinGame is inbound 64. The 853 wire fields
 * aE/qE are exposed under the historical iL/jL
 * names by structural position, so BloxClient keeps reading decoded.iL as the
 * local player id.
 */

// ---------------------------------------------------------------------------
// codec
// ---------------------------------------------------------------------------

function toBufferInput(data) {
  if (Buffer.isBuffer(data)) return data;
  if (ArrayBuffer.isView(data)) return Buffer.from(data.buffer, data.byteOffset, data.byteLength);
  return Buffer.from(data);
}

function decodeInbound(name, data) {
  const json = INBOUND_JSON[name];
  if (json) {
    if (data == null) return data;
    if (!json.map) return data;
    const out = {};
    for (const [legacy, live] of Object.entries(json.map)) out[legacy] = data[live];
    return out;
  }
  const type = INBOUND_SCHEMAS[name];
  if (!type) throw new Error('No inbound codec for ' + name);
  const decoded = type.fromBuffer(toBufferInput(data));
  if (name === 'SPacketEntityVelocityPlayer') return { dir: decoded };
  const fieldMap = INBOUND_FIELD_MAPS[name];
  return fieldMap ? mapInboundFields(fieldMap, decoded) : decoded;
}

function encodeOutbound(name, value) {
  const json = OUTBOUND_JSON[name];
  if (json) {
    if (!json.map) return normalizeOutbound(name, value);
    const out = {};
    for (const [legacy, live] of Object.entries(json.map)) if (value[legacy] !== undefined) out[live] = value[legacy];
    return out;
  }
  const type = OUTBOUND_SCHEMAS[name];
  if (!type) throw new Error('No outbound codec for ' + name);
  return type.toBuffer(normalizeOutbound(name, value));
}

/** Map legacy handler payload names onto the frozen generated field names. */
function normalizeOutbound(name, value) {
  switch (name) {
    case 'CPacketStartUse':
      return value;
    case 'CPacketFinishUse':
      return { Ai: Boolean(value && value.used), uR: Number((value && value.duration) || 0) };
    case 'CPacketTickEventDetection':
      return { hC: Number(value) };
    case 'CPacketKillDetection': {
      const id = value && typeof value === 'object' ? value.id : value;
      return { sC: Number(id || 0) };
    }
    case 'CPacketBaseEventDetection':
    case 'CPacketResponseDetection': {
      if (value && typeof value === 'object') {
        return { dD: Number(value.dD ?? value.id ?? 0), hD: Boolean(value.hD ?? value.response ?? true), JD: Number(value.JD ?? value.duration ?? 0) };
      }
      const count = Number(value || 0);
      return { dD: 0, hD: count > 0, JD: count };
    }
    case 'CPacketSimulationDetection':
      return {
        hj: Number(value.dmmg || 0),
        Jj: Number(value.multt || 0),
        yj: Number(value.crchSpd || 0),
        Uj: Number(value.wlkSpd || 0),
        wj: Number(value.runSpd || 0),
        vj: Number(value.time || 0),
        uj: Number(value.amount || 0),
        Kj: Number(value.dimWidth || 0),
        Ej: Number(value.dimHeight || 0),
        Qj: Number(value.mass || 0)
      };
    case 'CPacketPickupItem':
      return { Oj: value.itemEId, kR: Number(value.itemAmt || 0), Xj: Boolean(value.sendInfo) };
    case 'CPacketMovePlayer':
      return {
        CR: Number(value.x || 0),
        sR: Number(value.y || 0),
        cR: Number(value.z || 0),
        PR: Number(value.heading || 0),
        LR: Number(value.heading || 0),
        OR: Number(value.speed || 0),
        kC: Boolean(value.jumping),
        XR: Boolean(value.crouching),
        WR: Number(value.pitch || 0),
        bR: Boolean(value.armSwinging),
        YR: value.useDir || [0, 0, 0],
        rR: value.useDir || [0, 0, 0],
        aR: Number(value.ackPacketId || 0),
        NR: value.cameraDirection || [0, 0, 0],
        VR: false,
        MR: value.physicsVersion || ''
      };
    case 'CPacketAcceptTeleport':
      return { tR: Number(value.id || 0), zR: Number(value.type || 0) };
    case 'CPacketSelectSlot':
      return Number(value || 0);
    case 'CPacketSwingItem':
      return {
        lR: Number(value.type || 0),
        UD: Boolean(value.doubleClick),
        nD: value.targetPos || null,
        KD: value.targetBlock == null ? null : String(value.targetBlock)
      };
    case 'CPacketMilkEntity':
      return { KD: value.targetEId, oD: value.toSlot == null ? null : Number(value.toSlot) };
    case 'CPacketAttackEntity':
      return {
        aC: value.eId,
        NC: value.bodyPart == null ? null : value.bodyPart,
        ED: value.dirFacing || [0, 0, 0],
        SD: value.heldName == null ? null : value.heldName,
        VC: Number(value.v || 0),
        mT: Number(value.tickCounter || 0),
        dC: Number(value.clientClickCounter || 0)
      };
    case 'CPacketBreakEntity':
      return {
        SR: value.eId,
        ED: value.dirFacing || [0, 0, 0],
        SD: value.heldName == null ? null : value.heldName
      };
    case 'CPacketMoveItemAmount':
      return { mC: Number(value.i || 0), dR: Number(value.j || 0), hR: Number(value.amt || 0) };
    case 'CPacketMoveItem':
      return { ER: Number(value.i || 0), QR: Number(value.j || 0) };
    case 'CPacketRemoveItem':
      return { KC: Number(value.idx || 0), nC: Number(value.id || 0), RD: Number(value.amount || 0) };
    case 'CPacketChat':
      return { JC: value.msg, yC: value.channelName == null ? null : value.channelName };
    case 'CPacketUseItem':
      return {
        nD: value.targetPos == null ? null : value.targetPos,
        KD: value.targetEId == null ? null : value.targetEId,
        ED: value.dirFacing || [0, 0, 0],
        QD: Number(value.heldId || 0),
        xD: value.complete || '0'
      };
    case 'CPacketShopPurchase':
      return {
        categoryKey: value.category,
        itemKey: value.name,
        shopVersion: Number(value.shopVersion || 0),
        userInput: value.userInput == null ? null : value.userInput
      };
    case 'CPacketCloseChest':
      return null;
    case 'CPacketModifyBlock':
      return {
        BR: value.changePos || [0, 0, 0],
        qD: Number(value.toBlock || 0),
        qR: value.checker || '',
        ZR: false,
        pR: false,
        AR: false
      };
    case 'CPacketRequestChunk':
      return {
        UC: value.id,
        wC: value.lastSeen == null ? null : value.lastSeen,
        vC: value.hash == null ? null : value.hash,
        eC: value.forceRefresh,
        uC: Number(value.renderStatus || 0)
      };
    case 'CPacketUseBoat':
      return { gR: value.pos || [0, 0, 0] };
    case 'CPacketUseBucket':
      return { IR: value.pos || [0, 0, 0] };
    case 'CPacketFillBucket':
      return { RR: value.pos || [0, 0, 0], qD: Number(value.toBlock || 0), oD: value.toSlot == null ? null : Number(value.toSlot) };
    case 'CPacketEnchantItem':
      return {
        Yj: Number(value.enchantItemHeldIdx || 0),
        Nj: value.enchantItemTablePos || [0, 0, 0],
        Vj: Number(value.enchantItemLevel || 0)
      };
    default:
      return value;
  }
}

function isInboundBinary(name) {
  return Boolean(INBOUND_SCHEMAS[name]);
}

function isOutboundBinary(name) {
  return Boolean(OUTBOUND_SCHEMAS[name]);
}

module.exports = {
  VERSION,
  EVIDENCE,
  INBOUND_IDS,
  INBOUND_HANDLER_IDS,
  OUTBOUND_IDS,
  OUTBOUND_CALL_SITE_IDS,
  INBOUND_JSON,
  OUTBOUND_JSON,
  INBOUND_SCHEMAS,
  OUTBOUND_SCHEMAS,
  OUTBOUND_ALIASES,
  OUTBOUND_JSON_ALIASES,
  OUTBOUND_UNSUPPORTED,
  INBOUND_FIELD_MAPS,
  PROTOCOL_LEDGER,
  PROTOCOL_SETTINGS,
  decodeInbound,
  encodeOutbound,
  isInboundBinary,
  isOutboundBinary
};
