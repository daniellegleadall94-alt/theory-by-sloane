# Moving a company between organisations

In Organisations and companies, drag a company handle onto another organisation heading, or choose a destination in the company's edit panel. Both paths open the same preview. The acting user must be an owner or administrator in both active organisations.

The preview shows record counts and company-level access gains/losses. Confirmation does not transfer organisation membership. Destination organisation permissions apply; private records retain their named sharing rules. Company owners, assignees and named collaborators must already belong to the destination. Existing source access is preserved for people who also belong to the destination by granting company access there. Shares to people outside the destination are removed where the preview explicitly counts them.

The server recomputes a fingerprint of work, memberships and grants inside the transaction before moving. A stale preview is rejected. The company ID, canonical record keys and external IDs remain stable; task history and strategy snapshots stay attached. Channel lists remain on the company. Shared source lists needed by moving tasks are copied to the destination without removing the originals. Strategy lookup follows its company identity after a move, and generated strategy-review links are updated.

Moves are blocked when records span multiple companies, work has unresolved references across the boundary, owners or collaborators are missing from the destination, account permission groups need reassignment, or work is linked to a marketing request. Legacy nested company links must also be resolved. These checks prevent a partial or silently destructive transfer. Organisation-wide automations remain with their organisation; approval history moves with its record, but version-bound approvals may need renewed review.

Tests exercise stale preview rejection, shared-record blockers, missing collaborators, access gains/losses, persistent task IDs/history, channel plans, strategy continuity and source-list preservation. No live company data is moved by installing this feature.
