# TODO

## Calendar Source Governance

- [ ] Open an NBTCA organization Discussion for public calendar source maintenance
- [ ] Link the discussion to `nbtca/documents` and `nbtca/nbtcal`
- [ ] Add the actionable tracking issue to the organization Roadmap as `In Progress`
- [ ] Confirm the yearly owner for school academic calendar imports
- [ ] Define consent rules before recording member-specific dates
- [ ] Define the update path for NBTCA events and milestones

## Library

- [ ] Integrate `@nbtca/nbtcal` into `@nbtca/prompt`'s calendar feature: drop its
      inline ICS fetch/parse in favour of this package, and add a heatmap renderer
      on top of `heatmap()`
- [ ] Reuse the library in `nbtca.space/calendar` so CLI and web share one source
- [ ] Expose event categories/tags if the upstream feed adopts them
