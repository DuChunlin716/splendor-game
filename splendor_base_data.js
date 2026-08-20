// Splendor 基础版：发展卡 90 张 + 贵族 10 张
// 供原生 HTML/CSS/JavaScript 项目直接使用。
// 使用方法：在 index.html 中先于 game.js 引入：
// <script src="splendor_base_data.js"></script>
// 然后通过 window.SPLENDOR_BASE_DATA 访问数据。

window.SPLENDOR_BASE_DATA = {
  "meta": {
    "name": "Splendor Base Game Data",
    "developmentCards": 90,
    "levelCounts": {
      "1": 40,
      "2": 30,
      "3": 20
    },
    "nobles": 10,
    "colorKeys": {
      "white": "钻石/白",
      "blue": "蓝宝石/蓝",
      "green": "祖母绿/绿",
      "red": "红宝石/红",
      "black": "玛瑙/黑",
      "gold": "黄金/万能"
    }
  },
  "setup": {
    "2": {
      "normalTokensEach": 4,
      "goldTokens": 5,
      "noblesShown": 3
    },
    "3": {
      "normalTokensEach": 5,
      "goldTokens": 5,
      "noblesShown": 4
    },
    "4": {
      "normalTokensEach": 7,
      "goldTokens": 5,
      "noblesShown": 5
    },
    "faceUpCardsPerLevel": 4
  },
  "developmentCards": [
    {
      "id": "L1-01",
      "level": 1,
      "bonus": "white",
      "points": 0,
      "cost": {
        "blue": 1,
        "green": 1,
        "red": 1,
        "black": 1
      }
    },
    {
      "id": "L1-02",
      "level": 1,
      "bonus": "white",
      "points": 0,
      "cost": {
        "blue": 1,
        "green": 2,
        "red": 1,
        "black": 1
      }
    },
    {
      "id": "L1-03",
      "level": 1,
      "bonus": "white",
      "points": 0,
      "cost": {
        "blue": 2,
        "green": 2,
        "black": 1
      }
    },
    {
      "id": "L1-04",
      "level": 1,
      "bonus": "white",
      "points": 0,
      "cost": {
        "white": 3,
        "blue": 1,
        "black": 1
      }
    },
    {
      "id": "L1-05",
      "level": 1,
      "bonus": "white",
      "points": 0,
      "cost": {
        "red": 2,
        "black": 1
      }
    },
    {
      "id": "L1-06",
      "level": 1,
      "bonus": "white",
      "points": 0,
      "cost": {
        "blue": 2,
        "black": 2
      }
    },
    {
      "id": "L1-07",
      "level": 1,
      "bonus": "white",
      "points": 0,
      "cost": {
        "blue": 3
      }
    },
    {
      "id": "L1-08",
      "level": 1,
      "bonus": "white",
      "points": 1,
      "cost": {
        "green": 4
      }
    },
    {
      "id": "L1-09",
      "level": 1,
      "bonus": "blue",
      "points": 0,
      "cost": {
        "white": 1,
        "green": 1,
        "red": 1,
        "black": 1
      }
    },
    {
      "id": "L1-10",
      "level": 1,
      "bonus": "blue",
      "points": 0,
      "cost": {
        "white": 1,
        "green": 1,
        "red": 2,
        "black": 1
      }
    },
    {
      "id": "L1-11",
      "level": 1,
      "bonus": "blue",
      "points": 0,
      "cost": {
        "white": 1,
        "green": 2,
        "red": 2
      }
    },
    {
      "id": "L1-12",
      "level": 1,
      "bonus": "blue",
      "points": 0,
      "cost": {
        "blue": 1,
        "green": 3,
        "red": 1
      }
    },
    {
      "id": "L1-13",
      "level": 1,
      "bonus": "blue",
      "points": 0,
      "cost": {
        "white": 1,
        "black": 2
      }
    },
    {
      "id": "L1-14",
      "level": 1,
      "bonus": "blue",
      "points": 0,
      "cost": {
        "green": 2,
        "black": 2
      }
    },
    {
      "id": "L1-15",
      "level": 1,
      "bonus": "blue",
      "points": 0,
      "cost": {
        "black": 3
      }
    },
    {
      "id": "L1-16",
      "level": 1,
      "bonus": "blue",
      "points": 1,
      "cost": {
        "red": 4
      }
    },
    {
      "id": "L1-17",
      "level": 1,
      "bonus": "green",
      "points": 0,
      "cost": {
        "white": 1,
        "blue": 1,
        "red": 1,
        "black": 1
      }
    },
    {
      "id": "L1-18",
      "level": 1,
      "bonus": "green",
      "points": 0,
      "cost": {
        "white": 1,
        "blue": 1,
        "red": 1,
        "black": 2
      }
    },
    {
      "id": "L1-19",
      "level": 1,
      "bonus": "green",
      "points": 0,
      "cost": {
        "blue": 1,
        "red": 2,
        "black": 2
      }
    },
    {
      "id": "L1-20",
      "level": 1,
      "bonus": "green",
      "points": 0,
      "cost": {
        "white": 1,
        "blue": 3,
        "green": 1
      }
    },
    {
      "id": "L1-21",
      "level": 1,
      "bonus": "green",
      "points": 0,
      "cost": {
        "white": 2,
        "blue": 1
      }
    },
    {
      "id": "L1-22",
      "level": 1,
      "bonus": "green",
      "points": 0,
      "cost": {
        "blue": 2,
        "red": 2
      }
    },
    {
      "id": "L1-23",
      "level": 1,
      "bonus": "green",
      "points": 0,
      "cost": {
        "red": 3
      }
    },
    {
      "id": "L1-24",
      "level": 1,
      "bonus": "green",
      "points": 1,
      "cost": {
        "black": 4
      }
    },
    {
      "id": "L1-25",
      "level": 1,
      "bonus": "red",
      "points": 0,
      "cost": {
        "white": 1,
        "blue": 1,
        "green": 1,
        "black": 1
      }
    },
    {
      "id": "L1-26",
      "level": 1,
      "bonus": "red",
      "points": 0,
      "cost": {
        "white": 2,
        "blue": 1,
        "green": 1,
        "black": 1
      }
    },
    {
      "id": "L1-27",
      "level": 1,
      "bonus": "red",
      "points": 0,
      "cost": {
        "white": 2,
        "green": 1,
        "black": 2
      }
    },
    {
      "id": "L1-28",
      "level": 1,
      "bonus": "red",
      "points": 0,
      "cost": {
        "white": 1,
        "red": 1,
        "black": 3
      }
    },
    {
      "id": "L1-29",
      "level": 1,
      "bonus": "red",
      "points": 0,
      "cost": {
        "blue": 2,
        "green": 1
      }
    },
    {
      "id": "L1-30",
      "level": 1,
      "bonus": "red",
      "points": 0,
      "cost": {
        "white": 2,
        "red": 2
      }
    },
    {
      "id": "L1-31",
      "level": 1,
      "bonus": "red",
      "points": 0,
      "cost": {
        "white": 3
      }
    },
    {
      "id": "L1-32",
      "level": 1,
      "bonus": "red",
      "points": 1,
      "cost": {
        "white": 4
      }
    },
    {
      "id": "L1-33",
      "level": 1,
      "bonus": "black",
      "points": 0,
      "cost": {
        "white": 1,
        "blue": 1,
        "green": 1,
        "red": 1
      }
    },
    {
      "id": "L1-34",
      "level": 1,
      "bonus": "black",
      "points": 0,
      "cost": {
        "white": 1,
        "blue": 2,
        "green": 1,
        "red": 1
      }
    },
    {
      "id": "L1-35",
      "level": 1,
      "bonus": "black",
      "points": 0,
      "cost": {
        "white": 2,
        "blue": 2,
        "red": 1
      }
    },
    {
      "id": "L1-36",
      "level": 1,
      "bonus": "black",
      "points": 0,
      "cost": {
        "green": 1,
        "red": 3,
        "black": 1
      }
    },
    {
      "id": "L1-37",
      "level": 1,
      "bonus": "black",
      "points": 0,
      "cost": {
        "green": 2,
        "red": 1
      }
    },
    {
      "id": "L1-38",
      "level": 1,
      "bonus": "black",
      "points": 0,
      "cost": {
        "white": 2,
        "green": 2
      }
    },
    {
      "id": "L1-39",
      "level": 1,
      "bonus": "black",
      "points": 0,
      "cost": {
        "green": 3
      }
    },
    {
      "id": "L1-40",
      "level": 1,
      "bonus": "black",
      "points": 1,
      "cost": {
        "blue": 4
      }
    },
    {
      "id": "L2-01",
      "level": 2,
      "bonus": "white",
      "points": 1,
      "cost": {
        "green": 3,
        "red": 2,
        "black": 2
      }
    },
    {
      "id": "L2-02",
      "level": 2,
      "bonus": "white",
      "points": 1,
      "cost": {
        "white": 2,
        "blue": 3,
        "red": 3
      }
    },
    {
      "id": "L2-03",
      "level": 2,
      "bonus": "white",
      "points": 2,
      "cost": {
        "green": 1,
        "red": 4,
        "black": 2
      }
    },
    {
      "id": "L2-04",
      "level": 2,
      "bonus": "white",
      "points": 2,
      "cost": {
        "red": 5,
        "black": 3
      }
    },
    {
      "id": "L2-05",
      "level": 2,
      "bonus": "white",
      "points": 2,
      "cost": {
        "red": 5
      }
    },
    {
      "id": "L2-06",
      "level": 2,
      "bonus": "white",
      "points": 3,
      "cost": {
        "white": 6
      }
    },
    {
      "id": "L2-07",
      "level": 2,
      "bonus": "blue",
      "points": 1,
      "cost": {
        "blue": 2,
        "green": 2,
        "red": 3
      }
    },
    {
      "id": "L2-08",
      "level": 2,
      "bonus": "blue",
      "points": 1,
      "cost": {
        "blue": 2,
        "green": 3,
        "black": 3
      }
    },
    {
      "id": "L2-09",
      "level": 2,
      "bonus": "blue",
      "points": 2,
      "cost": {
        "white": 5,
        "blue": 3
      }
    },
    {
      "id": "L2-10",
      "level": 2,
      "bonus": "blue",
      "points": 2,
      "cost": {
        "white": 2,
        "red": 1,
        "black": 4
      }
    },
    {
      "id": "L2-11",
      "level": 2,
      "bonus": "blue",
      "points": 2,
      "cost": {
        "blue": 5
      }
    },
    {
      "id": "L2-12",
      "level": 2,
      "bonus": "blue",
      "points": 3,
      "cost": {
        "blue": 6
      }
    },
    {
      "id": "L2-13",
      "level": 2,
      "bonus": "green",
      "points": 1,
      "cost": {
        "white": 3,
        "green": 2,
        "red": 3
      }
    },
    {
      "id": "L2-14",
      "level": 2,
      "bonus": "green",
      "points": 1,
      "cost": {
        "white": 2,
        "blue": 3,
        "black": 2
      }
    },
    {
      "id": "L2-15",
      "level": 2,
      "bonus": "green",
      "points": 2,
      "cost": {
        "white": 4,
        "blue": 2,
        "black": 1
      }
    },
    {
      "id": "L2-16",
      "level": 2,
      "bonus": "green",
      "points": 2,
      "cost": {
        "blue": 5,
        "green": 3
      }
    },
    {
      "id": "L2-17",
      "level": 2,
      "bonus": "green",
      "points": 2,
      "cost": {
        "green": 5
      }
    },
    {
      "id": "L2-18",
      "level": 2,
      "bonus": "green",
      "points": 3,
      "cost": {
        "green": 6
      }
    },
    {
      "id": "L2-19",
      "level": 2,
      "bonus": "red",
      "points": 1,
      "cost": {
        "white": 2,
        "red": 2,
        "black": 3
      }
    },
    {
      "id": "L2-20",
      "level": 2,
      "bonus": "red",
      "points": 1,
      "cost": {
        "blue": 3,
        "red": 2,
        "black": 3
      }
    },
    {
      "id": "L2-21",
      "level": 2,
      "bonus": "red",
      "points": 2,
      "cost": {
        "white": 1,
        "blue": 4,
        "green": 2
      }
    },
    {
      "id": "L2-22",
      "level": 2,
      "bonus": "red",
      "points": 2,
      "cost": {
        "white": 3,
        "black": 5
      }
    },
    {
      "id": "L2-23",
      "level": 2,
      "bonus": "red",
      "points": 2,
      "cost": {
        "black": 5
      }
    },
    {
      "id": "L2-24",
      "level": 2,
      "bonus": "red",
      "points": 3,
      "cost": {
        "red": 6
      }
    },
    {
      "id": "L2-25",
      "level": 2,
      "bonus": "black",
      "points": 1,
      "cost": {
        "white": 3,
        "blue": 2,
        "green": 2
      }
    },
    {
      "id": "L2-26",
      "level": 2,
      "bonus": "black",
      "points": 1,
      "cost": {
        "white": 3,
        "green": 3,
        "black": 2
      }
    },
    {
      "id": "L2-27",
      "level": 2,
      "bonus": "black",
      "points": 2,
      "cost": {
        "blue": 1,
        "green": 4,
        "red": 2
      }
    },
    {
      "id": "L2-28",
      "level": 2,
      "bonus": "black",
      "points": 2,
      "cost": {
        "green": 5,
        "red": 3
      }
    },
    {
      "id": "L2-29",
      "level": 2,
      "bonus": "black",
      "points": 2,
      "cost": {
        "white": 5
      }
    },
    {
      "id": "L2-30",
      "level": 2,
      "bonus": "black",
      "points": 3,
      "cost": {
        "black": 6
      }
    },
    {
      "id": "L3-01",
      "level": 3,
      "bonus": "white",
      "points": 3,
      "cost": {
        "blue": 3,
        "green": 3,
        "red": 5,
        "black": 3
      }
    },
    {
      "id": "L3-02",
      "level": 3,
      "bonus": "white",
      "points": 4,
      "cost": {
        "black": 7
      }
    },
    {
      "id": "L3-03",
      "level": 3,
      "bonus": "white",
      "points": 4,
      "cost": {
        "white": 3,
        "red": 3,
        "black": 6
      }
    },
    {
      "id": "L3-04",
      "level": 3,
      "bonus": "white",
      "points": 5,
      "cost": {
        "white": 3,
        "black": 7
      }
    },
    {
      "id": "L3-05",
      "level": 3,
      "bonus": "blue",
      "points": 3,
      "cost": {
        "white": 3,
        "green": 3,
        "red": 3,
        "black": 5
      }
    },
    {
      "id": "L3-06",
      "level": 3,
      "bonus": "blue",
      "points": 4,
      "cost": {
        "white": 7
      }
    },
    {
      "id": "L3-07",
      "level": 3,
      "bonus": "blue",
      "points": 4,
      "cost": {
        "white": 6,
        "blue": 3,
        "black": 3
      }
    },
    {
      "id": "L3-08",
      "level": 3,
      "bonus": "blue",
      "points": 5,
      "cost": {
        "white": 7,
        "blue": 3
      }
    },
    {
      "id": "L3-09",
      "level": 3,
      "bonus": "green",
      "points": 3,
      "cost": {
        "white": 5,
        "blue": 3,
        "red": 3,
        "black": 3
      }
    },
    {
      "id": "L3-10",
      "level": 3,
      "bonus": "green",
      "points": 4,
      "cost": {
        "blue": 7
      }
    },
    {
      "id": "L3-11",
      "level": 3,
      "bonus": "green",
      "points": 4,
      "cost": {
        "white": 3,
        "blue": 6,
        "green": 3
      }
    },
    {
      "id": "L3-12",
      "level": 3,
      "bonus": "green",
      "points": 5,
      "cost": {
        "blue": 7,
        "green": 3
      }
    },
    {
      "id": "L3-13",
      "level": 3,
      "bonus": "red",
      "points": 3,
      "cost": {
        "white": 3,
        "blue": 5,
        "green": 3,
        "black": 3
      }
    },
    {
      "id": "L3-14",
      "level": 3,
      "bonus": "red",
      "points": 4,
      "cost": {
        "green": 7
      }
    },
    {
      "id": "L3-15",
      "level": 3,
      "bonus": "red",
      "points": 4,
      "cost": {
        "blue": 3,
        "green": 6,
        "red": 3
      }
    },
    {
      "id": "L3-16",
      "level": 3,
      "bonus": "red",
      "points": 5,
      "cost": {
        "green": 7,
        "red": 3
      }
    },
    {
      "id": "L3-17",
      "level": 3,
      "bonus": "black",
      "points": 3,
      "cost": {
        "white": 3,
        "blue": 3,
        "green": 5,
        "red": 3
      }
    },
    {
      "id": "L3-18",
      "level": 3,
      "bonus": "black",
      "points": 4,
      "cost": {
        "red": 7
      }
    },
    {
      "id": "L3-19",
      "level": 3,
      "bonus": "black",
      "points": 4,
      "cost": {
        "green": 3,
        "red": 6,
        "black": 3
      }
    },
    {
      "id": "L3-20",
      "level": 3,
      "bonus": "black",
      "points": 5,
      "cost": {
        "red": 7,
        "black": 3
      }
    }
  ],
  "nobles": [
    {
      "id": "N01",
      "points": 3,
      "requirement": {
        "white": 3,
        "blue": 3,
        "black": 3
      }
    },
    {
      "id": "N02",
      "points": 3,
      "requirement": {
        "blue": 3,
        "green": 3,
        "red": 3
      }
    },
    {
      "id": "N03",
      "points": 3,
      "requirement": {
        "white": 3,
        "red": 3,
        "black": 3
      }
    },
    {
      "id": "N04",
      "points": 3,
      "requirement": {
        "green": 4,
        "red": 4
      }
    },
    {
      "id": "N05",
      "points": 3,
      "requirement": {
        "blue": 4,
        "green": 4
      }
    },
    {
      "id": "N06",
      "points": 3,
      "requirement": {
        "red": 4,
        "black": 4
      }
    },
    {
      "id": "N07",
      "points": 3,
      "requirement": {
        "white": 4,
        "black": 4
      }
    },
    {
      "id": "N08",
      "points": 3,
      "requirement": {
        "white": 3,
        "blue": 3,
        "green": 3
      }
    },
    {
      "id": "N09",
      "points": 3,
      "requirement": {
        "green": 3,
        "red": 3,
        "black": 3
      }
    },
    {
      "id": "N10",
      "points": 3,
      "requirement": {
        "white": 4,
        "blue": 4
      }
    }
  ]
};
