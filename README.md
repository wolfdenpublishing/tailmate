# TailMate 🐾

A free, open-source homemade dog food calculator. Build nutritionally balanced
recipes for your dogs, get precise batch prep quantities, and generate a
shopping list — all from a single web page with no account required.

![TailMate Screenshot](screenshot.png)

## Features

- **Multi-dog support** — configure any number of dogs with individual weights,
  breeds, ages, and life stages (including pregnancy and lactation)
- **Calorie-accurate portions** — Resting Energy Requirement (RER) + life stage
  multipliers per AAFCO guidelines
- **100+ pre-populated ingredients** across proteins, carbohydrates, vegetables,
  fruits, and treats & enticers — each with safety notes and cook-loss ratios
- **Flexible macro split** — adjust protein/carb/vegetable/fruit percentages to
  your preference
- **Batch planning** — specify days to prep and meals per day; get exact
  shopping weights (accounting for cooking shrinkage/expansion) and per-pet
  per-meal serving sizes
- **Actual batch weight override** — weigh your finished batch and get updated
  per-meal portions automatically
- **Shopping list** — grouped by category with checkboxes and one-click copy
- **BalanceIT integration guidance** — total batch kcal shown for easy
  supplement calculation
- **Recipe saving** — name and save recipes locally; load or delete anytime
- **11 color themes** — Stormy Morning (default), Mossy Hollow, Chili Spice,
  Ink Wash, Golden Taupe, Wisteria Bloom, Spiced Chai, California Beaches,
  Sunny Day, Retro Sunset, Alchemical Reaction
- **No account required** — works entirely in your browser with local storage

## Live App

👉 **[tailmate.app](https://YOUR_GITHUB_USERNAME.github.io/YOUR_REPO_NAME)**

## Important Note on Nutritional Completeness

Homemade dog food requires a veterinary-formulated supplement to be
nutritionally complete. TailMate is designed to be used alongside
**[BalanceIT](https://www.balanceit.com/)** — the app displays your total
batch kcal so you can use their calculator to determine the correct
supplement amount.

Always consult your veterinarian before significantly changing your dog's diet.

## Getting Started

No installation needed. Just open `index.html` in any modern browser, or visit
the live GitHub Pages URL above.

### Running locally

```bash
git clone https://github.com/YOUR_USERNAME/YOUR_REPO_NAME.git
cd YOUR_REPO_NAME
open index.html   # macOS
# or just open index.html in your browser
```

## Tech Stack

- Pure HTML, CSS, and vanilla JavaScript — no framework, no build step
- Google Fonts (Lora + Nunito) — the only external resource
- Browser localStorage for persistence (Firebase Firestore sync coming soon)

## Roadmap

- [ ] Google sign-in with Firebase Firestore sync (use on any device)
- [ ] URL-based recipe sharing (share a recipe link with anyone)
- [ ] Custom ingredient support
- [ ] Printable recipe cards

## Contributing

Contributions are welcome. Please open an issue first to discuss any significant
changes. For bug fixes or small improvements, a pull request is fine directly.

When contributing, please:
- Keep the app as a single `index.html` file unless there's a compelling reason
  to split it
- Follow the `StorageAdapter` pattern for any new storage operations (see
  `CLAUDE.md` for architecture details)
- Test in both Chrome and Firefox before submitting

## License

MIT — see [LICENSE](LICENSE) for details.

## Acknowledgments

- Ingredient safety data and nutritional guidance compiled from ASPCA,
  PetMD, and AAFCO sources
- Color themes from [Figma's color combination library](https://www.figma.com/resource-library/color-combinations/)
- Supplement calculation via [BalanceIT](https://www.balanceit.com/)
