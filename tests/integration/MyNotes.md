# Story

As an academic user, I would like to keep track of my notes/zettels and citations , so that I can more easily create publications based upon remixing and integrating these events.

## Scenario 1: Note viewing
- [ ] GIVEN that I am logged-into Alexandria
- [ ] AND my user is stored and/or cached
- [ ] AND there is no menu item on the navigation bar for "My Notes"
- [ ] WHEN I have selected "My Notes" from the profile menu
- [ ] THEN the "My Notes" page opens, to display a table
- [ ] AND it displays all of my kind 30041 zettel notes
- [ ] AND it displays all of my kind 30, 31, 32, and 33 citation notes
- [ ] AND clicking on a table row, causes that row to be highlighted

## Scenario 2: User status
- [ ] GIVEN that I am logged into Alexandria
- [ ] AND I am looking at the "My Notes" page
- [ ] WHEN I log out of Alexandria
- [ ] THEN I am redirected to the landing page
- [ ] AND the menu item "My Notes" is removed from the profile menu
- [ ] AND the user is cleared from the store and/or cache

## Scenario 3: Note gathering
- [ ] GIVEN that I am looking at the "My Notes" page
- [ ] WHEN the relay fetch is conducted, to gather the kinds 30040, 30041, 30, 31, 32, 33 notes
- [ ] THEN my user inbox relays from kind 10002 are included, if there are any
- [ ] AND my local relays from kind 10432 are included, if there are any
- [ ] AND the community relays are included
- [ ] AND the relay list is normalized and deduplicated before fetching
- [ ] AND I fetch from all of the resulting relays in parallel
- [ ] AND the fetch times out within 5 seconds
- [ ] AND one relay being down doesn't block the fetch
- [ ] AND the results are added to a map, as they arrive
- [ ] AND the results include the information of which relay found which note
- [ ] AND the results are then aggregated and displayed in the My Notes page, as a table

## Scenario 4: Note table sorting
- [ ] GIVEN that I am looking at the My Notes page table
- [ ] AND the table has the column headers: Title, Created Date, Type (zettel/citation)
- [ ] WHEN I click on a table header
- [ ] THEN I can sort by that header

## Scenario 5: Note table filtering
- [ ] GIVEN that I am looking at the My Notes page table
- [ ] WHEN I select the tag, relay, or label filter-dropdown boxes
- [ ] THEN I can select one or more items with a checkmark
- [ ] AND the table will be filtered to show only notes with those items in them
- [ ] WHEN I select the "only unattached notes"
- [ ] THEN I only see the entries for notes (zettel and citations) that are not part of the a-tag list in a 30040 publication

## Scenario 6: Note table searching
- [ ] GIVEN that I am looking at the My Notes page table
- [ ]  WHEN I enter a search term into the search bar at the top
- [ ] THEN the table is filtered to display only notes containing that text
- [ ] AND the search field pertains to the title, summary, and content tags of the notes in the table

## Scenario 7: Note display
- [ ] GIVEN I have clicked on a row in the table
- [ ] AND that row is highlighted
- [ ] WHEN a pencil/pen icon appears on the right end of that row
- [ ] THEN clicking that icon opens the note viewing modal
- [ ] AND kind 30041 zettels are displayed with Asciidoc rendering
- [ ] AND kind 30-33 citations are displayed with NostrMarkup rendering

## Scenario 8: Note editing
- [ ] GIVEN that I have opened a note in the display viewer
- [ ] AND there is a button "Edit"
- [ ] WHEN I click on that button
- [ ] THEN the modal changes to the edit modal
- [ ] AND it is preloaded with the current information
- [ ] AND that is: title, d-tag (for 30041 only), summary, content, other tags
- [ ] AND I can edit that information and add/remove tags, 
- [ ] AND I can "Save" the note, and receive a success message, if it publishes to at least 1 relay (otherwise, an error message)
- [ ] AND saving a 30041 note publishes the new state of the fields, but with a new event ID, sig, and created_at, and that note replaces the other
- [ ] BUT saving a 30, 31, 32, 33 note publishes a new note, that does not replace the other, as it has no d-tags
- [ ] AND the modal then returns to the display viewer and shows me the new state (30041) or the additional, new note (30-33)
- [ ] AND the note is refreshed in the table, so that it also shows me the new state or the newly-created note