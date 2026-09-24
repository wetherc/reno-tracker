-- Finds the links that end at an item, such as the ones a delete of that
-- item cascades to, without a scan of every link.
CREATE INDEX dependencies_successorId ON dependencies(successorId);
